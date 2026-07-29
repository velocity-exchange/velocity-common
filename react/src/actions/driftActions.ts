import { CommonDriftStore } from '../stores/useCommonDriftStore';
import {
	BulkAccountLoader,
	VelocityClient,
	VelocityClientConfig,
	VelocityEnv,
	IWallet,
	PollingVelocityClientAccountSubscriber,
	PublicKey,
	Wallet,
	WhileValidTxSender,
	getMarketsAndOraclesForSubscription,
	initialize,
} from '@velocity-exchange/sdk';
import { EnvironmentConstants, RpcEndpoint } from '@drift/common';
import { Commitment, Connection, Keypair } from '@solana/web3.js';
import { StoreApi } from 'zustand';

import type {
	Adapter,
	BaseMessageSignerWalletAdapter,
	// @ts-ignore
} from '@solana/wallet-adapter-base';

const DEFAULT_WALLET = new Wallet(new Keypair());
const DEFAULT_COMMITMENT_LEVEL: Commitment = 'confirmed';

const createDriftActions = (
	get: StoreApi<CommonDriftStore>['getState'],
	set: (x: (s: CommonDriftStore) => void) => void
) => {
	const subscribeToDriftClientData = async () => {
		try {
			const driftClient = get().driftClient.client;

			if (!driftClient) {
				return;
			}

			let subscriptionResult = await driftClient.subscribe();

			if (!subscriptionResult) {
				// retry once
				subscriptionResult = await driftClient.subscribe();
			}

			driftClient.eventEmitter.on('update', () => {
				set((s) => {
					s.driftClient.updateSignaler = {};
				});
			});

			set((s) => {
				s.driftClient.isSubscribed = subscriptionResult;
			});

			return subscriptionResult;
		} catch (err) {
			// Todo notify about this or retry?
			console.log(err);
		}
	};

	/**
	 *
	 * @param newRpc Rpc URL to be updated to
	 * @param newDriftEnv Drift environment to be updated to
	 * @param subscribe Whether to subscribe to the new connection. Default is true.
	 * @param additionalDriftClientConfig Additional drift client configuration
	 * @returns
	 */
	const updateConnection = async ({
		newRpc,
		newDriftEnv,
		subscribeToAccounts = true,
		additionalDriftClientConfig = {},
	}: {
		newRpc: RpcEndpoint;
		newDriftEnv?: VelocityEnv;
		additionalDriftClientConfig?: Partial<VelocityClientConfig>;
		subscribeToAccounts?: boolean;
	}) => {
		const storeState = get();
		const Env = storeState.env;
		const driftEnvToUse = newDriftEnv || Env.driftEnv;
		const additionalTxSenderCallbacks = Env.additionalTxSenderCallbacks;
		const sdkConfig = initialize({ env: driftEnvToUse });
		let rpcToUse = newRpc?.value;

		// Override rpc with one set from env variable
		if (Env.rpcOverride) {
			console.log(`overriding selected rpc with ${rpcToUse}`);
			rpcToUse = Env.rpcOverride;
		}

		let newConnection: Connection;
		try {
			newConnection = new Connection(rpcToUse, DEFAULT_COMMITMENT_LEVEL);
		} catch (e) {
			console.error('error connecting to rpc');

			// TODO -- decide how we want to handle notifications?
			// NOTIFICATION_UTILS.toast.warn(
			// 	'Error connecting to RPC. If the problem persists you may need to try restarting.'
			// );

			return;
		}

		const walletToUse = storeState.driftClient.client?.wallet ?? DEFAULT_WALLET;
		const currentDriftClient = storeState.driftClient.client;

		let accountLoader: BulkAccountLoader | undefined = undefined;

		if (currentDriftClient) {
			if (currentDriftClient.userAccountSubscriptionConfig.type === 'polling') {
				// reuse the previous account loader object
				accountLoader = (
					currentDriftClient.accountSubscriber as PollingVelocityClientAccountSubscriber
				).accountLoader;
				accountLoader.connection = newConnection;
			}
			await currentDriftClient.unsubscribe();
		}

		if (!accountLoader) {
			accountLoader = new BulkAccountLoader(
				newConnection,
				DEFAULT_COMMITMENT_LEVEL,
				storeState.get().env.basePollingRateMs
			);
		}

		const { oracleInfos, perpMarketIndexes, spotMarketIndexes } =
			getMarketsAndOraclesForSubscription(driftEnvToUse);

		const driftClientConfig: VelocityClientConfig = {
			connection: newConnection,
			wallet: walletToUse,
			programID: new PublicKey(sdkConfig.VELOCITY_PROGRAM_ID),
			accountSubscription: {
				type: 'polling',
				accountLoader: accountLoader,
			},
			perpMarketIndexes: perpMarketIndexes,
			spotMarketIndexes: spotMarketIndexes,
			oracleInfos: oracleInfos,
			userStats: true,
			includeDelegates: true,
			env: driftEnvToUse,
			// dont waste rpc calls loading users for this made up wallet
			skipLoadUsers: true,
			txVersion: 0,
			...additionalDriftClientConfig,
		};

		const newDriftClient = new VelocityClient(driftClientConfig);

		const rpcs =
			EnvironmentConstants.rpcs[driftEnvToUse === 'devnet' ? 'dev' : 'mainnet'];

		const additionalConnections = rpcs
			.filter(
				(rpc) => rpc.value !== newRpc?.value && rpc.allowAdditionalConnection
			)
			.map((rpc) => new Connection(rpc.value, DEFAULT_COMMITMENT_LEVEL));

		newDriftClient.txSender = new WhileValidTxSender({
			connection: newConnection,
			wallet: newDriftClient.wallet,
			retrySleep: Env.txSenderRetryInterval,
			additionalConnections,
			additionalTxSenderCallbacks,
			txHandler: newDriftClient.txHandler,
		});

		set((s) => {
			s.bulkAccountLoader = accountLoader;
			s.connection = newConnection;
			s.driftClient.client = newDriftClient;
			s.env.driftEnv = driftEnvToUse;
			// s.currentRpc = newRpc;
			s.sdkConfig = sdkConfig;
		});

		if (subscribeToAccounts) {
			await subscribeToDriftClientData();
		}
	};

	/*
	 * Fetches user accounts and users for authority and subscribes to them
	 */
	const fetchAndSubscribeToUsersAndSubaccounts = async (
		driftClient: VelocityClient,
		authority: PublicKey
	) => {
		// This method seems pretty slow, is there a better way?
		// Nothing else I've tried is working...
		const userAccounts =
			await driftClient.getUserAccountsForAuthority(authority);

		await Promise.all(
			userAccounts.map((account) =>
				driftClient.addUser(account.subAccountId, authority)
			)
		);

		const users = driftClient.getUsers();

		set((s) => {
			s.authority = authority;
			s.userAccountNotInitialized = users.length === 0;
			s.subscribedToSubaccounts = true;
			s.userAccounts = userAccounts;
		});

		return userAccounts;
	};

	const handleWalletDisconnect = async () => {
		const state = get();

		// eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
		const driftClient = state.driftClient.client!;

		// Switch to a random wallet to stop
		driftClient.updateWallet(new Wallet(new Keypair()));
		state.clearUserData();
	};

	const handleWalletConnect = async (
		authority: PublicKey,
		adapter: Adapter,
		subscribeToDriftUsers = true
	) => {
		const state = get();
		state.clearUserData();
		const driftClient = state?.driftClient?.client;

		if (!driftClient) return;

		try {
			if (subscribeToDriftUsers) {
				driftClient.updateWallet(adapter as IWallet);

				const userAccounts = await fetchAndSubscribeToUsersAndSubaccounts(
					driftClient,
					authority
				);
				if (userAccounts.length > 0) {
					driftClient.switchActiveUser(userAccounts[0].subAccountId);
				}

				set((s) => {
					s.authority = authority;
					s.subscribedToSubaccounts = true;
				});
			} else {
				set((s) => {
					s.authority = authority;
				});
			}
		} catch (err) {
			console.log('failed to subscribe to users');
			console.log(err);
			set((s) => {
				s.subscribedToSubaccounts = false;
			});
		}
	};

	const emulateAccount = async (props: { authority: PublicKey }) => {
		const state = get();
		const driftClient = state?.driftClient?.client;
		if (!driftClient) return;

		const newKeypair = new Keypair({
			publicKey: props.authority.toBytes(),
			secretKey: new Keypair().publicKey.toBytes(),
		});
		const newWallet: BaseMessageSignerWalletAdapter = {
			publicKey: newKeypair.publicKey,
			autoApprove: false,
			connected: true,
			//@ts-ignore
			signTransaction: () => {
				return Promise.resolve();
			},
			//@ts-ignore
			signAllTransactions: () => {
				return Promise.resolve();
			},
			//@ts-ignore
			connect: () => {},
			disconnect: async () => {},
			//@ts-ignore
			on: (_event: string, _fn: () => void) => {},
		};

		const success = await driftClient.updateWallet(newWallet as IWallet);
		if (!success) {
			console.log('Error emulating account');
			return;
		}

		const subscribeSuccess = await driftClient.subscribe();
		if (!subscribeSuccess) {
			console.log('Error subscribing to emulated account');
			return;
		}

		const userAccounts = await fetchAndSubscribeToUsersAndSubaccounts(
			driftClient,
			props.authority
		);
		if (userAccounts.length > 0) {
			driftClient.switchActiveUser(userAccounts[0].subAccountId);
		}
		set((s) => {
			s.emulationMode = true;
		});
	};

	return {
		handleWalletConnect,
		updateConnection,
		emulateAccount,
		handleWalletDisconnect,
		fetchAndSubscribeToUsersAndSubaccounts,
	};
};

export default createDriftActions;

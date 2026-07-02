import {
	BigNum,
	BN,
	CustomizedCadenceBulkAccountLoader,
	DelistedMarketSetting,
	DevnetPerpMarkets,
	DevnetSpotMarkets,
	VELOCITY_PROGRAM_ID,
	VelocityClient,
	VelocityClientConfig,
	VelocityEnv,
	fetchUserStatsAccount,
	getMarketsAndOraclesForSubscription,
	MainnetPerpMarkets,
	MainnetSpotMarkets,
	MarketType,
	MIN_I64,
	OneShotUserAccountSubscriber,
	OrderTriggerCondition,
	PerpMarketConfig,
	PositionDirection,
	PriorityFeeMethod,
	PriorityFeeSubscriber,
	PriorityFeeSubscriberConfig,
	PublicKey,
	SettlePnlMode,
	SpotMarketConfig,
	SwapMode,
	TxParams,
	UnifiedQuoteResponse,
	UnifiedSwapClient,
	User,
	WhileValidTxSender,
	ZERO,
} from '@velocity-exchange/sdk';
import {
	Connection,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { createPlaceholderIWallet } from '../../../../utils/accounts/wallet';
import { logger } from '../../../../utils/logger';
import {
	DEFAULT_ACCOUNT_LOADER_COMMITMENT,
	DEFAULT_ACCOUNT_LOADER_POLLING_FREQUENCY_MS,
	DEFAULT_TX_SENDER_CONFIRMATION_STRATEGY,
	DEFAULT_TX_SENDER_RETRY_INTERVAL,
	HIGH_ACTIVITY_MARKET_ACCOUNTS,
} from '../../constants';
import { createDepositTxn } from '../../../base/actions/spot/deposit';
import { createWithdrawTxn } from '../../../base/actions/spot/withdraw';
import { getTokenAddressForDepositAndWithdraw } from '../../../../utils/token';
import { createSettleFundingTxn } from '../../../base/actions/perp/settleFunding';
import {
	createSettlePnlIx,
	createSettlePnlTxn,
} from '../../../base/actions/perp/settlePnl';
import {
	createOpenPerpMarketOrder,
	createOpenPerpMarketOrderIxs,
	createSwiftMarketOrderMessage,
} from '../../../base/actions/trade/openPerpOrder/openPerpMarketOrder';
import {
	createOpenPerpNonMarketOrder,
	createSwiftLimitOrderMessage,
} from '../../../base/actions/trade/openPerpOrder/openPerpNonMarketOrder';
import { SwiftOrderMessage } from '../../../base/actions/trade/openPerpOrder/openSwiftOrder';
import { SwiftLimitOrderParamsOrderConfig } from '../../../base/actions/trade/openPerpOrder/types';
import { createEditOrderTxn } from '../../../base/actions/trade/editOrder';
import { createCancelOrdersTxn } from '../../../base/actions/trade/cancelOrder';
import { createSwapTxn } from '../../../base/actions/trade/swap';
import {
	createUserAndDepositCollateralBaseTxn,
	ReferralParams,
} from '../../../base/actions/user/create';
import { deleteUserTxn } from '../../../base/actions/user/delete';
import { createRevenueShareEscrowTxn } from '../../../base/actions/builder/createRevenueShareEscrow';
import { createRevenueShareAccountTxn } from '../../../base/actions/builder/createRevenueShareAccount';
import { configureBuilderTxn } from '../../../base/actions/builder/configureBuilder';
import { EnvironmentConstants } from '../../../../EnvironmentConstants';
import {
	CentralServerGetOpenPerpMarketOrderTxnParams,
	CentralServerGetOpenPerpNonMarketOrderTxnParams,
	CentralServerGetWithdrawIsolatedPerpPositionCollateralTxnParams,
	CentralServerGetCloseAndWithdrawIsolatedPerpPositionTxnParams,
	CentralServerGetDepositAndOpenIsolatedPerpPositionTxnParams,
	CentralServerGetCloseAndWithdrawIsolatedPerpPositionToWalletTxnParams,
} from './types';
import { CentralServerVelocityMarkets } from './markets';
import { VelocityOperations } from '../AuthorityVelocity/VelocityOperations';

export type {
	CentralServerGetOpenPerpMarketOrderTxnParams,
	CentralServerGetOpenPerpNonMarketOrderTxnParams,
	CentralServerSwiftOrderOptions,
	CentralServerGetWithdrawIsolatedPerpPositionCollateralTxnParams,
	CentralServerGetCloseAndWithdrawIsolatedPerpPositionTxnParams,
	CentralServerGetDepositAndOpenIsolatedPerpPositionTxnParams,
	CentralServerGetCloseAndWithdrawIsolatedPerpPositionToWalletTxnParams,
} from './types';
export type { SwiftOrderMessage } from '../../../base/actions/trade/openPerpOrder/openSwiftOrder';

/**
 * A Velocity client that fetches user data on-demand, while market data is continuously subscribed to.
 *
 * This is useful for an API server that fetches user data on-demand, and return transaction messages specific to a given user
 */
export class CentralServerVelocity {
	private _velocityClient: VelocityClient;
	private _perpMarketConfigs: PerpMarketConfig[];
	private _spotMarketConfigs: SpotMarketConfig[];
	/**
	 * The public endpoints that can be used to retrieve Velocity data / interact with the Velocity program.
	 */
	private _velocityEndpoints: {
		dlobServerHttpUrl: string;
		swiftServerUrl: string;
	};

	/**
	 * Handles priority fee tracking and calculation for optimized transaction costs.
	 */
	private priorityFeeSubscriber!: PriorityFeeSubscriber;

	/**
	 * Mutex to serialize velocityClientContextWrapper calls, preventing
	 * concurrent mutations of shared VelocityClient state.
	 */
	private _mutex: Promise<void> = Promise.resolve();

	public readonly markets: CentralServerVelocityMarkets;

	/**
	 * @param solanaRpcEndpoint - The Solana RPC endpoint to use for reading RPC data.
	 * @param velocityEnv - The Velocity environment to use for the Velocity client.
	 * @param supportedPerpMarkets - The perp markets indexes to support. See https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/perpMarkets.ts for all available markets. It is recommended to only include markets that will be used.
	 * @param supportedSpotMarkets - The spot markets indexes to support. See https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/spotMarkets.ts for all available markets. It is recommended to only include markets that will be used.
	 */
	constructor(config: {
		solanaRpcEndpoint: string;
		velocityEnv: VelocityEnv;
		supportedPerpMarkets: number[];
		supportedSpotMarkets: number[];
		additionalVelocityClientConfig?: Partial<Omit<VelocityClientConfig, 'env'>>;
		priorityFeeSubscriberConfig?: Partial<PriorityFeeSubscriberConfig>;
	}) {
		const velocityEnv = config.velocityEnv;

		const connection = new Connection(config.solanaRpcEndpoint);
		const velocityProgramID = new PublicKey(VELOCITY_PROGRAM_ID);
		const accountLoader = new CustomizedCadenceBulkAccountLoader(
			connection,
			DEFAULT_ACCOUNT_LOADER_COMMITMENT,
			DEFAULT_ACCOUNT_LOADER_POLLING_FREQUENCY_MS
		);

		const wallet = createPlaceholderIWallet(); // use random wallet to initialize a central-server instance

		const allPerpMarketConfigs =
			velocityEnv === 'devnet' ? DevnetPerpMarkets : MainnetPerpMarkets;
		const allSpotMarketConfigs =
			velocityEnv === 'devnet' ? DevnetSpotMarkets : MainnetSpotMarkets;
		this._perpMarketConfigs = config.supportedPerpMarkets
			.map((marketIndex) =>
				allPerpMarketConfigs.find(
					(market) => market.marketIndex === marketIndex
				)
			)
			.filter((m): m is PerpMarketConfig => m !== undefined);
		this._spotMarketConfigs = config.supportedSpotMarkets
			.map((marketIndex) =>
				allSpotMarketConfigs.find(
					(market) => market.marketIndex === marketIndex
				)
			)
			.filter((m): m is SpotMarketConfig => m !== undefined);

		const oracleInfos = getMarketsAndOraclesForSubscription(
			velocityEnv,
			this._perpMarketConfigs,
			this._spotMarketConfigs
		);

		const velocityClientConfig: VelocityClientConfig = {
			env: velocityEnv,
			connection,
			wallet,
			programID: velocityProgramID,
			enableMetricsEvents: false,
			accountSubscription: {
				type: 'polling',
				accountLoader,
			},
			userStats: false,
			includeDelegates: false,
			skipLoadUsers: true,
			delistedMarketSetting: DelistedMarketSetting.Unsubscribe,
			perpMarketIndexes: this._perpMarketConfigs.map(
				(market) => market.marketIndex
			),
			spotMarketIndexes: this._spotMarketConfigs.map(
				(market) => market.marketIndex
			),
			oracleInfos: oracleInfos.oracleInfos,
			...config.additionalVelocityClientConfig,
		};
		this._velocityClient = new VelocityClient(velocityClientConfig);
		this.markets = new CentralServerVelocityMarkets(this._velocityClient);

		const txSender = new WhileValidTxSender({
			connection,
			wallet,
			additionalConnections: [],
			additionalTxSenderCallbacks: [],
			txHandler: this._velocityClient.txHandler,
			confirmationStrategy: DEFAULT_TX_SENDER_CONFIRMATION_STRATEGY,
			retrySleep: DEFAULT_TX_SENDER_RETRY_INTERVAL,
		});

		this._velocityClient.txSender = txSender;

		// set up Velocity endpoints
		const velocityDlobServerHttpUrlToUse =
			EnvironmentConstants.dlobServerHttpUrl[
				config.velocityEnv === 'devnet' ? 'dev' : 'mainnet'
			];
		const swiftServerUrlToUse =
			EnvironmentConstants.swiftServerUrl[
				config.velocityEnv === 'devnet' ? 'dev' : 'mainnet'
			];
		this._velocityEndpoints = {
			dlobServerHttpUrl: velocityDlobServerHttpUrlToUse,
			swiftServerUrl: swiftServerUrlToUse,
		};

		const priorityFeeConfig: PriorityFeeSubscriberConfig = {
			connection: this.velocityClient.connection,
			priorityFeeMethod: PriorityFeeMethod.SOLANA,
			addresses: HIGH_ACTIVITY_MARKET_ACCOUNTS,
			...config.priorityFeeSubscriberConfig,
		};

		this.priorityFeeSubscriber = new PriorityFeeSubscriber(priorityFeeConfig);
	}

	public get velocityClient() {
		return this._velocityClient;
	}

	public async subscribe() {
		await this._velocityClient.subscribe();
		await this.priorityFeeSubscriber.subscribe();
	}

	public async unsubscribe() {
		await this._velocityClient.unsubscribe();
		await this.priorityFeeSubscriber.unsubscribe();
	}

	/**
	 * Temporarily swaps the VelocityClient wallet/authority context to build transactions
	 * for a given authority, then restores the original state.
	 *
	 * Use this for authority-based operations that don't require a User account subscription
	 * (e.g. creating revenue share accounts, managing builders).
	 *
	 * @param authority - The authority to set on the VelocityClient
	 * @param operation - The transaction creation operation to execute
	 * @returns The result of the operation
	 */
	private async authorityContextWrapper<T>(
		authority: PublicKey,
		operation: () => Promise<T>
	): Promise<T> {
		const originalWallet = this._velocityClient.wallet;
		const originalAuthority = this._velocityClient.authority;

		const authorityWallet = {
			publicKey: authority,
			signTransaction: () =>
				Promise.reject('This is a placeholder - do not sign with this wallet'),
			signAllTransactions: () =>
				Promise.reject('This is a placeholder - do not sign with this wallet'),
		};

		try {
			this._velocityClient.wallet = authorityWallet;
			// @ts-ignore
			this._velocityClient.provider.wallet = authorityWallet;
			this._velocityClient.txHandler.updateWallet(authorityWallet);
			this._velocityClient.authority = authority;

			return await operation();
		} finally {
			this._velocityClient.wallet = originalWallet;
			this._velocityClient.txHandler.updateWallet(originalWallet);
			// @ts-ignore
			this._velocityClient.provider.wallet = originalWallet;
			this._velocityClient.authority = originalAuthority;
		}
	}

	/**
	 * Manages VelocityClient state for transaction creation with proper setup and cleanup.
	 * This abstraction handles:
	 * - User creation and subscription
	 * - Authority management
	 * - Wallet replacement for correct transaction signing
	 * - Cleanup and state restoration
	 *
	 * @param userAccountPublicKey - The user account public key
	 * @param operation - The transaction creation operation to execute
	 * @returns The result of the operation
	 */
	private async velocityClientContextWrapper<T>(
		userAccountPublicKey: PublicKey,
		operation: (user: User) => Promise<T>,
		externalWallet?: PublicKey
	): Promise<T> {
		// Acquire mutex — wait for any previous operation to finish
		let release: () => void;
		const acquire = new Promise<void>((resolve) => {
			release = resolve;
		});
		const prev = this._mutex;
		this._mutex = acquire;
		await prev;

		const user = new User({
			velocityClient: this._velocityClient,
			userAccountPublicKey,
			accountSubscription: {
				type: 'custom',
				userAccountSubscriber: new OneShotUserAccountSubscriber(
					this._velocityClient.program,
					userAccountPublicKey,
					undefined,
					undefined
				),
			},
		});

		// Store original state
		const originalWallet = this._velocityClient.wallet;
		const originalAuthority = this._velocityClient.authority;

		try {
			// Setup: Subscribe to user and configure VelocityClient
			await user.subscribe();

			const authority = user.getUserAccountOrThrow().authority;
			const subAccountId = user.getUserAccountOrThrow().subAccountId;
			this._velocityClient.authority = authority;

			const success = await this._velocityClient.addUser(
				subAccountId,
				authority
			);
			await this._velocityClient.switchActiveUser(subAccountId, authority);

			if (!success) {
				throw new Error('Failed to add user to VelocityClient');
			}

			// Replace wallet with user's authority to ensure correct transaction signing
			// This is necessary because VelocityClient adds wallet.publicKey to instructions
			const userWallet = {
				publicKey: externalWallet ?? authority,
				signTransaction: () =>
					Promise.reject(
						'This is a placeholder - do not sign with this wallet'
					),
				signAllTransactions: () =>
					Promise.reject(
						'This is a placeholder - do not sign with this wallet'
					),
			};

			// Update wallet in all places that reference it
			this._velocityClient.wallet = userWallet;
			//@ts-ignore
			this._velocityClient.provider.wallet = userWallet;
			this._velocityClient.txHandler.updateWallet(userWallet);

			// Execute the operation
			const result = await operation(user);

			return result;
		} finally {
			// Cleanup: Always restore original state and unsubscribe
			this._velocityClient.wallet = originalWallet;
			//@ts-ignore
			this._velocityClient.provider.wallet = originalWallet;
			this._velocityClient.txHandler.updateWallet(originalWallet);
			this._velocityClient.authority = originalAuthority;
			// clear cached PDA so it doesn't leak between requests
			this._velocityClient.userStatsAccountPublicKey = undefined;

			try {
				await user.unsubscribe();
				this._velocityClient.users.clear();
			} catch (cleanupError) {
				logger.warn('Error during cleanup:', cleanupError);
				// Don't throw cleanup errors, but log them
			}

			// Release mutex — let next queued operation proceed
			release!();
		}
	}

	/**
	 * Returns a User object for a given user account public key. This fetches the user account data once.
	 *
	 * You may read more about the User object [here](https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/user.ts)
	 *
	 * @param userAccountPublicKey - The user account public key
	 */
	public async getUser(userAccountPublicKey: PublicKey): Promise<User> {
		const oneShotUserAccountSubscriber = new OneShotUserAccountSubscriber(
			this._velocityClient.program,
			userAccountPublicKey,
			undefined,
			undefined
		);
		const user = new User({
			velocityClient: this._velocityClient,
			userAccountPublicKey,
			accountSubscription: {
				type: 'custom',
				userAccountSubscriber: oneShotUserAccountSubscriber,
			},
		});
		await user.subscribe();
		return user;
	}

	/**
	 * Gets transaction parameters with dynamic priority fees.
	 * Falls back to default if priority fee function is not available.
	 */
	getTxParams(overrides?: Partial<TxParams>): TxParams {
		const unsafePriorityFee = Math.floor(
			this.priorityFeeSubscriber.getCustomStrategyResult() ??
				VelocityOperations.DEFAULT_TX_PARAMS.computeUnitsPrice
		);

		const safePriorityFee = Math.min(
			unsafePriorityFee,
			VelocityOperations.MAX_COMPUTE_UNITS_PRICE
		);

		return {
			...VelocityOperations.DEFAULT_TX_PARAMS,
			computeUnitsPrice: safePriorityFee,
			...overrides,
		};
	}

	public async getCreateAndDepositTxn(
		authority: PublicKey,
		amount: BN,
		spotMarketIndex: number,
		options?: {
			referral?: ReferralParams;
			accountName?: string;
			poolId?: number;
			fromSubAccountId?: number;
			customMaxMarginRatio?: number;
			txParams?: TxParams;
			/**
			 * Optional external wallet to deposit from. If provided, the deposit will be made
			 * from this wallet instead of the authority wallet.
			 */
			externalWallet?: PublicKey;
		}
	): Promise<{
		transaction: VersionedTransaction | Transaction;
		userAccountPublicKey: PublicKey;
		subAccountId: number;
	}> {
		const spotMarketConfig = this._spotMarketConfigs.find(
			(market) => market.marketIndex === spotMarketIndex
		);

		if (!spotMarketConfig) {
			throw new Error(
				`Spot market config not found for index ${spotMarketIndex}`
			);
		}

		const userStatsAccount = await fetchUserStatsAccount(
			this._velocityClient.connection,
			this._velocityClient.program,
			authority
		);

		return this.authorityContextWrapper(
			options?.externalWallet ?? authority,
			async () => {
				this._velocityClient.authority = authority;
				// Clear userStatsAccountPublicKey cache so it's recalculated for the new authority
				// @ts-ignore - accessing private property for cache invalidation
				this._velocityClient.userStatsAccountPublicKey = undefined;

				return await createUserAndDepositCollateralBaseTxn({
					velocityClient: this._velocityClient,
					amount,
					spotMarketConfig,
					authority,
					userStatsAccount,
					referral: options?.referral,
					accountName: options?.accountName,
					poolId: options?.poolId,
					fromSubAccountId: options?.fromSubAccountId,
					customMaxMarginRatio: options?.customMaxMarginRatio,
					txParams: options?.txParams ?? this.getTxParams(),
					externalWallet: options?.externalWallet,
				});
			}
		);
	}

	public async getDepositTxn(
		userAccountPublicKey: PublicKey,
		amount: BN,
		spotMarketIndex: number,
		options?: {
			txParams?: TxParams;
			/**
			 * Optional external wallet to deposit from. If provided, the deposit will be made
			 * from this wallet instead of the user's authority wallet.
			 */
			externalWallet?: PublicKey;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const spotMarketConfig = this._spotMarketConfigs.find(
					(market) => market.marketIndex === spotMarketIndex
				);

				if (!spotMarketConfig) {
					throw new Error(
						`Spot market config not found for index ${spotMarketIndex}`
					);
				}

				const depositTxn = await createDepositTxn({
					velocityClient: this._velocityClient,
					user,
					amount: BigNum.from(amount, spotMarketConfig.precisionExp),
					spotMarketConfig,
					txParams: options?.txParams ?? this.getTxParams(),
					externalWallet: options?.externalWallet,
				});

				return depositTxn;
			},
			options?.externalWallet
		);
	}

	public async getDeleteUserTxn(
		user: User,
		options?: {
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			user.userAccountPublicKey,
			async () => {
				const userStatsAccount = await fetchUserStatsAccount(
					this._velocityClient.connection,
					this._velocityClient.program,
					user.getUserAccountOrThrow().authority
				);

				if (!userStatsAccount) {
					throw new Error('User stats account not found');
				}

				return deleteUserTxn({
					velocityClient: this._velocityClient,
					user,
					userStatsAccount,
					txParams: options?.txParams ?? this.getTxParams(),
				});
			}
		);
	}

	public async getWithdrawTxn(
		userAccountPublicKey: PublicKey,
		amount: BN,
		spotMarketIndex: number,
		options?: {
			isBorrow?: boolean;
			isMax?: boolean;
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const spotMarketConfig = this._spotMarketConfigs.find(
					(market) => market.marketIndex === spotMarketIndex
				);

				if (!spotMarketConfig) {
					throw new Error(
						`Spot market config not found for index ${spotMarketIndex}`
					);
				}

				const withdrawTxn = await createWithdrawTxn({
					velocityClient: this._velocityClient,
					user,
					amount: BigNum.from(amount, spotMarketConfig.precisionExp),
					spotMarketConfig,
					isBorrow: options?.isBorrow,
					isMax: options?.isMax,
					txParams: options?.txParams ?? this.getTxParams(),
				});

				return withdrawTxn;
			}
		);
	}

	public async getSettleFundingTxn(
		userAccountPublicKey: PublicKey,
		options?: {
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const settleFundingTxn = await createSettleFundingTxn({
					velocityClient: this._velocityClient,
					user,
					txParams: options?.txParams ?? this.getTxParams(),
				});

				return settleFundingTxn;
			}
		);
	}

	public async getSettlePnlTxn(
		userAccountPublicKey: PublicKey,
		marketIndexes: number[],
		options?: {
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const settlePnlTxn = await createSettlePnlTxn({
					velocityClient: this._velocityClient,
					user,
					marketIndexes,
					txParams: options?.txParams ?? this.getTxParams(),
				});

				return settlePnlTxn;
			}
		);
	}

	// overloads for better type inference
	public async getOpenPerpMarketOrderTxn(
		params: CentralServerGetOpenPerpMarketOrderTxnParams<true>
	): Promise<SwiftOrderMessage>;
	public async getOpenPerpMarketOrderTxn(
		params: CentralServerGetOpenPerpMarketOrderTxnParams<false>
	): Promise<Transaction | VersionedTransaction>;
	public async getOpenPerpMarketOrderTxn(
		params:
			| CentralServerGetOpenPerpMarketOrderTxnParams<true>
			| CentralServerGetOpenPerpMarketOrderTxnParams<false>
	): Promise<SwiftOrderMessage | Transaction | VersionedTransaction> {
		const { userAccountPublicKey, useSwift, ...genericRest } = params;

		if (useSwift) {
			const { swiftOptions, ...rest } =
				genericRest as CentralServerGetOpenPerpMarketOrderTxnParams<true>;
			return this.velocityClientContextWrapper(
				userAccountPublicKey,
				async (user): Promise<SwiftOrderMessage> => {
					return createSwiftMarketOrderMessage({
						...rest,
						velocityClient: this._velocityClient,
						user,
						dlobServerHttpUrl: this._velocityEndpoints.dlobServerHttpUrl,
						userSigningSlotBuffer: swiftOptions?.userSigningSlotBuffer,
						isDelegate: swiftOptions?.isDelegate ?? !!rest.mainSignerOverride,
					});
				}
			);
		} else {
			const { txParams, ...rest } =
				genericRest as CentralServerGetOpenPerpMarketOrderTxnParams<false>;
			return this.velocityClientContextWrapper(
				userAccountPublicKey,
				async (user): Promise<Transaction | VersionedTransaction> => {
					const openPerpMarketOrderTxn = await createOpenPerpMarketOrder({
						...rest,
						useSwift: false,
						velocityClient: this._velocityClient,
						user,
						dlobServerHttpUrl: this._velocityEndpoints.dlobServerHttpUrl,
						txParams: txParams ?? this.getTxParams(),
					});
					return openPerpMarketOrderTxn as Transaction | VersionedTransaction;
				},
				rest.mainSignerOverride
			);
		}
	}

	/**
	 * Create a perp non-market order with amount and asset type
	 */
	public async getOpenPerpNonMarketOrderTxn(
		params: CentralServerGetOpenPerpNonMarketOrderTxnParams<true>
	): Promise<SwiftOrderMessage>;
	public async getOpenPerpNonMarketOrderTxn(
		params: CentralServerGetOpenPerpNonMarketOrderTxnParams<false>
	): Promise<Transaction | VersionedTransaction>;
	public async getOpenPerpNonMarketOrderTxn(
		params:
			| CentralServerGetOpenPerpNonMarketOrderTxnParams<true>
			| CentralServerGetOpenPerpNonMarketOrderTxnParams<false>
	): Promise<SwiftOrderMessage | Transaction | VersionedTransaction> {
		const { userAccountPublicKey, useSwift, ...genericRest } = params;

		if (useSwift) {
			const { swiftOptions, ...rest } =
				genericRest as CentralServerGetOpenPerpNonMarketOrderTxnParams<true>;

			if (
				rest.orderConfig.orderType !== 'limit' &&
				rest.orderConfig.orderType !== 'oracleLimit'
			) {
				throw new Error(
					'Only limit and oracle limit orders are supported with Swift'
				);
			}

			return this.velocityClientContextWrapper(
				userAccountPublicKey,
				async (user): Promise<SwiftOrderMessage> => {
					return createSwiftLimitOrderMessage({
						...rest,
						velocityClient: this._velocityClient,
						user,
						orderConfig: rest.orderConfig as SwiftLimitOrderParamsOrderConfig,
						userSigningSlotBuffer: swiftOptions?.userSigningSlotBuffer,
						isDelegate: swiftOptions?.isDelegate ?? !!rest.mainSignerOverride,
					});
				}
			);
		} else {
			const { txParams, ...rest } =
				genericRest as CentralServerGetOpenPerpNonMarketOrderTxnParams<false>;
			return this.velocityClientContextWrapper(
				userAccountPublicKey,
				async (user): Promise<Transaction | VersionedTransaction> => {
					const openPerpNonMarketOrderTxn = await createOpenPerpNonMarketOrder({
						...rest,
						useSwift: false,
						velocityClient: this._velocityClient,
						user,
						txParams: txParams ?? this.getTxParams(),
					});
					return openPerpNonMarketOrderTxn as
						| Transaction
						| VersionedTransaction;
				},
				rest.mainSignerOverride
			);
		}
	}

	/**
	 * Create a transaction to withdraw collateral from an isolated perp position back to cross. Often to be called after fully closing position
	 */
	public async getWithdrawIsolatedPerpPositionCollateralTxn(
		params: CentralServerGetWithdrawIsolatedPerpPositionCollateralTxnParams
	): Promise<VersionedTransaction | Transaction> {
		const perpMarketConfig = this._perpMarketConfigs.find(
			(m) => m.marketIndex === params.marketIndex
		);
		if (!perpMarketConfig) {
			throw new Error(
				`Perp market config not found for index ${params.marketIndex}`
			);
		}
		return this.velocityClientContextWrapper(
			params.userAccountPublicKey,
			async (user) => {
				const signingAuthority = params.mainSignerOverride;
				const ixs: import('@solana/web3.js').TransactionInstruction[] = [];
				const shouldSettlePnl =
					params.settlePnlFirst ?? params.isFullWithdrawal ?? false;
				if (shouldSettlePnl) {
					const settleIx = await createSettlePnlIx({
						velocityClient: this._velocityClient,
						user,
						marketIndexes: [params.marketIndex],
						mode: SettlePnlMode.TRY_SETTLE,
						mainSignerOverride: signingAuthority,
					});
					ixs.push(settleIx);
				}
				const position =
					user.getUserAccountOrThrow().perpPositions[params.marketIndex];
				const transferAmount =
					params.isFullWithdrawal && position.baseAssetAmount.eq(ZERO)
						? MIN_I64
						: params.amount.neg();
				const transferIx =
					await this._velocityClient.getTransferIsolatedPerpPositionDepositIx(
						transferAmount,
						params.marketIndex,
						user.getUserAccountOrThrow().subAccountId,
						true,
						signingAuthority
					);
				ixs.push(transferIx);
				return this._velocityClient.buildTransaction(
					ixs,
					params.txParams ?? this.getTxParams()
				);
			},
			params.mainSignerOverride
		);
	}

	/**
	 * Single transaction: close isolated position + optionally withdraw collateral.
	 * Without placeAndTake that atomically fills the close, the entire transaction may FAIL:
	 * the withdraw ix runs after the close, and if the close did not fill in this tx,
	 * the whole tx will fail. Strongly consider placeAndTake: { enable: true }
	 * when closing and withdrawing in the same tx.
	 */
	public async getCloseAndWithdrawIsolatedPerpPositionTxn(
		params: CentralServerGetCloseAndWithdrawIsolatedPerpPositionTxnParams
	): Promise<VersionedTransaction | Transaction> {
		const perpMarketConfig = this._perpMarketConfigs.find(
			(m) => m.marketIndex === params.marketIndex
		);
		if (!perpMarketConfig) {
			throw new Error(
				`Perp market config not found for index ${params.marketIndex}`
			);
		}
		return this.velocityClientContextWrapper(
			params.userAccountPublicKey,
			async (user) => {
				const signingAuthority = params.mainSignerOverride;
				const ixs: TransactionInstruction[] = [];
				if (
					params.settlePnlBeforeClose &&
					params.withdrawCollateralAfterClose
				) {
					const settleIx = await createSettlePnlIx({
						velocityClient: this._velocityClient,
						user,
						marketIndexes: [params.marketIndex],
						mode: SettlePnlMode.TRY_SETTLE,
						mainSignerOverride: signingAuthority,
					});
					ixs.push(settleIx);
				}
				const closeIxs = await createOpenPerpMarketOrderIxs({
					velocityClient: this._velocityClient,
					user,
					marketIndex: params.marketIndex,
					direction: params.direction,
					amount: params.baseAssetAmount,
					assetType: params.assetType ?? 'base',
					reduceOnly: true,
					dlobServerHttpUrl: this._velocityEndpoints.dlobServerHttpUrl,
					positionMaxLeverage: 0,
					mainSignerOverride: signingAuthority,
					placeAndTake: params.placeAndTake,
				});
				ixs.push(...closeIxs);
				if (params.withdrawCollateralAfterClose) {
					const transferIx =
						await this._velocityClient.getTransferIsolatedPerpPositionDepositIx(
							MIN_I64,
							params.marketIndex,
							user.getUserAccountOrThrow().subAccountId,
							true,
							signingAuthority
						);
					ixs.push(transferIx);
				}
				return this._velocityClient.buildTransaction(
					ixs,
					params.txParams ?? this.getTxParams()
				);
			},
			params.mainSignerOverride
		);
	}

	/**
	 * Deposit from wallet + open isolated perp position in one transaction.
	 * Flow: deposit from wallet directly into isolated, then place order.
	 */
	public async getDepositAndOpenIsolatedPerpPositionTxn(
		params: CentralServerGetDepositAndOpenIsolatedPerpPositionTxnParams
	): Promise<Transaction | VersionedTransaction> {
		const { depositAmount, userAccountPublicKey, ...rest } = params;
		if (!depositAmount || depositAmount.isZero()) {
			throw new Error('depositAmount is required and must be non-zero');
		}
		const perpMarketConfig = this._perpMarketConfigs.find(
			(m) => m.marketIndex === params.marketIndex
		);
		if (!perpMarketConfig) {
			throw new Error(
				`Perp market config not found for index ${params.marketIndex}`
			);
		}
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const signingAuthority = rest.mainSignerOverride;
				const subAccountId = user.getUserAccountOrThrow().subAccountId;

				const perpMarketAccount =
					this._velocityClient.getPerpMarketAccountOrThrow(params.marketIndex);
				const quoteSpotMarketIndex = perpMarketAccount.quoteSpotMarketIndex;
				const spotMarketAccount =
					this._velocityClient.getSpotMarketAccountOrThrow(
						quoteSpotMarketIndex
					);
				const depositor =
					signingAuthority ?? user.getUserAccountOrThrow().authority;
				const userTokenAccount = await getTokenAddressForDepositAndWithdraw(
					spotMarketAccount,
					depositor
				);

				const depositIx =
					await this._velocityClient.getDepositIntoIsolatedPerpPositionIx(
						depositAmount,
						params.marketIndex,
						userTokenAccount,
						subAccountId
					);

				const orderIxs = await createOpenPerpMarketOrderIxs({
					...rest,
					velocityClient: this._velocityClient,
					user,
					dlobServerHttpUrl: this._velocityEndpoints.dlobServerHttpUrl,
					mainSignerOverride: signingAuthority,
				});

				const ixs = [depositIx, ...orderIxs];
				return this._velocityClient.buildTransaction(
					ixs,
					params.txParams ?? this.getTxParams()
				);
			},
			rest.mainSignerOverride
		);
	}

	/**
	 * Close isolated position + withdraw to wallet in one transaction.
	 * Flow: close order, then withdraw from isolated directly to wallet (bundle handles settle if needed).
	 * Without placeAndTake that atomically fills the close, the entire transaction may FAIL:
	 * the withdraw runs after the close, and if the close did not fill in this tx, the withdraw may fail depending on withdraw amount.
	 * Strongly consider placeAndTake: { enable: true } when closing and withdrawing.
	 */
	public async getCloseAndWithdrawIsolatedPerpPositionToWalletTxn(
		params: CentralServerGetCloseAndWithdrawIsolatedPerpPositionToWalletTxnParams
	): Promise<VersionedTransaction | Transaction> {
		const perpMarketConfig = this._perpMarketConfigs.find(
			(m) => m.marketIndex === params.marketIndex
		);
		if (!perpMarketConfig) {
			throw new Error(
				`Perp market config not found for index ${params.marketIndex}`
			);
		}
		return this.velocityClientContextWrapper(
			params.userAccountPublicKey,
			async (user) => {
				const signingAuthority = params.mainSignerOverride;
				const subAccountId = user.getUserAccountOrThrow().subAccountId;

				const closeIxs = await createOpenPerpMarketOrderIxs({
					velocityClient: this._velocityClient,
					user,
					marketIndex: params.marketIndex,
					direction: params.direction,
					amount: params.baseAssetAmount,
					assetType: params.assetType ?? 'base',
					reduceOnly: true,
					dlobServerHttpUrl: this._velocityEndpoints.dlobServerHttpUrl,
					positionMaxLeverage: 0,
					mainSignerOverride: signingAuthority,
					placeAndTake: params.placeAndTake,
				});

				const perpMarketAccount =
					this._velocityClient.getPerpMarketAccountOrThrow(params.marketIndex);
				const quoteSpotMarketIndex = perpMarketAccount.quoteSpotMarketIndex;
				const spotMarketAccount =
					this._velocityClient.getSpotMarketAccountOrThrow(
						quoteSpotMarketIndex
					);
				const withdrawToAuthority =
					params.mainSignerOverride ?? user.getUserAccountOrThrow().authority;
				const userTokenAccount = await getTokenAddressForDepositAndWithdraw(
					spotMarketAccount,
					withdrawToAuthority
				);

				const withdrawAmount =
					params.estimatedWithdrawAmount ??
					this._velocityClient.getIsolatedPerpPositionTokenAmount(
						params.marketIndex,
						subAccountId
					);
				const withdrawIxs =
					await this._velocityClient.getWithdrawFromIsolatedPerpPositionIxsBundle(
						withdrawAmount,
						params.marketIndex,
						subAccountId,
						userTokenAccount
					);

				const ixs = [...closeIxs, ...withdrawIxs];
				return this._velocityClient.buildTransaction(
					ixs,
					params.txParams ?? this.getTxParams()
				);
			},
			params.mainSignerOverride
		);
	}

	/**
	 * Create a transaction to edit an existing order
	 */
	public async getEditOrderTxn(
		userAccountPublicKey: PublicKey,
		orderId: number,
		editOrderParams: {
			newDirection?: PositionDirection;
			newBaseAmount?: BN;
			newLimitPrice?: BN;
			newOraclePriceOffset?: number;
			newTriggerPrice?: BN;
			newTriggerCondition?: OrderTriggerCondition;
			auctionDuration?: number;
			auctionStartPrice?: BN;
			auctionEndPrice?: BN;
			reduceOnly?: boolean;
			postOnly?: boolean;
			bitFlags?: number;
			maxTs?: BN;
			policy?: number;
			positionMaxLeverage?: number;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const editOrderTxn = await createEditOrderTxn({
					velocityClient: this._velocityClient,
					user,
					orderId,
					editOrderParams,
				});

				return editOrderTxn;
			}
		);
	}

	/**
	 * Create a transaction to cancel specific orders by their IDs
	 */
	public async getCancelOrdersTxn(
		userAccountPublicKey: PublicKey,
		orderIds: number[]
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const cancelOrdersTxn = await createCancelOrdersTxn({
					velocityClient: this._velocityClient,
					user,
					orderIds,
				});

				return cancelOrdersTxn;
			}
		);
	}

	/**
	 * Create a transaction to cancel all orders for a user
	 */
	public async getCancelAllOrdersTxn(
		userAccountPublicKey: PublicKey,
		marketType?: MarketType,
		marketIndex?: number,
		direction?: PositionDirection
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const ix = await this._velocityClient.getCancelOrdersIx(
					marketType ?? null,
					marketIndex ?? null,
					direction ?? null,
					user.getUserAccountOrThrow().subAccountId
				);

				const cancelAllOrdersTxn = await this._velocityClient.buildTransaction(
					ix
				);

				return cancelAllOrdersTxn;
			}
		);
	}

	/**
	 * Create a swap transaction between two spot markets using Jupiter
	 */
	public async getSwapTxn(
		userAccountPublicKey: PublicKey,
		fromMarketIndex: number,
		toMarketIndex: number,
		amount: BN,
		options?: {
			slippageBps?: number;
			swapMode?: SwapMode;
			onlyDirectRoutes?: boolean;
			quote?: UnifiedQuoteResponse;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.velocityClientContextWrapper(
			userAccountPublicKey,
			async (user) => {
				const fromSpotMarketConfig = this._spotMarketConfigs.find(
					(market) => market.marketIndex === fromMarketIndex
				);
				const toSpotMarketConfig = this._spotMarketConfigs.find(
					(market) => market.marketIndex === toMarketIndex
				);

				if (!fromSpotMarketConfig) {
					throw new Error(
						`From spot market config not found for index ${fromMarketIndex}`
					);
				}

				if (!toSpotMarketConfig) {
					throw new Error(
						`To spot market config not found for index ${toMarketIndex}`
					);
				}

				const swapClient = new UnifiedSwapClient({
					clientType: 'jupiter',
					connection: this._velocityClient.connection,
				});

				// Get quote if not provided
				let quote = options?.quote;
				if (!quote) {
					quote = await swapClient.getQuote({
						inputMint: fromSpotMarketConfig.mint,
						outputMint: toSpotMarketConfig.mint,
						amount,
						slippageBps: options?.slippageBps ?? 10, // Default 0.1%
						swapMode: options?.swapMode ?? 'ExactIn',
						onlyDirectRoutes: options?.onlyDirectRoutes ?? false,
					});
				}

				const swapTxn = await createSwapTxn({
					velocityClient: this._velocityClient,
					swapClient,
					user,
					swapFromMarketIndex: fromMarketIndex,
					swapToMarketIndex: toMarketIndex,
					amount,
					quote,
					txParams: {
						useSimulatedComputeUnits: true,
						computeUnitsBufferMultiplier: 1.5,
					},
				});

				return swapTxn;
			}
		);
	}

	/**
	 * Create a transaction to initialize a RevenueShareEscrow account for a user.
	 * Optionally bundles an initial builder approval in the same transaction.
	 */
	public async getCreateRevenueShareEscrowTxn(
		authority: PublicKey,
		options?: {
			numOrders?: number;
			builder?: {
				builderAuthority: PublicKey;
				maxFeeTenthBps: number;
			};
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.authorityContextWrapper(authority, () =>
			createRevenueShareEscrowTxn({
				velocityClient: this._velocityClient,
				authority,
				numOrders: options?.numOrders ?? 16,
				builder: options?.builder,
				txParams: options?.txParams ?? this.getTxParams(),
			})
		);
	}

	/**
	 * Create a transaction to initialize a RevenueShare account for a builder.
	 * This must be initialized before a builder can receive builder fees.
	 */
	public async getCreateRevenueShareAccountTxn(
		authority: PublicKey,
		options?: {
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.authorityContextWrapper(authority, () =>
			createRevenueShareAccountTxn({
				velocityClient: this._velocityClient,
				authority,
				txParams: options?.txParams ?? this.getTxParams(),
			})
		);
	}

	/**
	 * Create a transaction to configure a builder's approval status and fee cap.
	 * Handles approve, update, and revoke operations.
	 * Set maxFeeTenthBps to 0 to revoke a builder.
	 */
	public async getConfigureApprovedBuilderTxn(
		authority: PublicKey,
		builderAuthority: PublicKey,
		maxFeeTenthBps: number,
		options?: {
			txParams?: TxParams;
		}
	): Promise<VersionedTransaction | Transaction> {
		return this.authorityContextWrapper(authority, () =>
			configureBuilderTxn({
				velocityClient: this._velocityClient,
				authority,
				builderAuthority,
				maxFeeTenthBps,
				txParams: options?.txParams ?? this.getTxParams(),
			})
		);
	}

	public async sendSignedTransaction(tx: VersionedTransaction | Transaction) {
		return this._velocityClient.sendTransaction(tx, undefined, undefined, true);
	}
}

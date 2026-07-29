import { IWalletV2, PublicKey } from '@velocity-exchange/sdk';
import { Keypair } from '@solana/web3.js';

export enum ConnectionStateSteps {
	NotConnected = 0,
	AdapterConnected = 1,
	ClientConnected = 2,
	BalanceLoaded = 4,
	SubaccountsSubscribed = 8,
}

export enum ConnectionStates {
	NotConnected = ConnectionStateSteps.NotConnected,
	AdapterConnected = ConnectionStateSteps.AdapterConnected,
	ClientConnected = ConnectionStateSteps.ClientConnected,
	BalanceLoaded = ConnectionStateSteps.BalanceLoaded,
	SubaccountsSubscribed = ConnectionStateSteps.SubaccountsSubscribed,
	FullyConnected = ConnectionStateSteps.AdapterConnected +
		ConnectionStateSteps.ClientConnected +
		ConnectionStateSteps.BalanceLoaded +
		ConnectionStateSteps.SubaccountsSubscribed,
}

export type ConnectionStepString = keyof typeof ConnectionStateSteps;

export type ConnectionStateString = keyof typeof ConnectionStates;

export class WalletConnectionState {
	state: number;
	authority: PublicKey;

	constructor(authority: PublicKey) {
		this.state = ConnectionStates.NotConnected;
		this.authority = authority;
	}

	is(stateQuery: ConnectionStateString) {
		switch (stateQuery) {
			case 'NotConnected':
				return this.state === ConnectionStates.NotConnected;
			case 'AdapterConnected':
				return (
					(this.state & ConnectionStates.AdapterConnected) ===
					ConnectionStates.AdapterConnected
				);
			case 'ClientConnected':
				return (
					(this.state & ConnectionStates.ClientConnected) ===
					ConnectionStates.ClientConnected
				);
			case 'BalanceLoaded':
				return (
					(this.state & ConnectionStates.BalanceLoaded) ===
					ConnectionStates.BalanceLoaded
				);
			case 'FullyConnected':
				return (
					(this.state & ConnectionStates.FullyConnected) ===
					ConnectionStates.FullyConnected
				);
			case 'SubaccountsSubscribed':
				return (
					(this.state & ConnectionStates.SubaccountsSubscribed) ===
					ConnectionStates.SubaccountsSubscribed
				);
			default: {
				// Throw a typescript error if we have an unhandled case
				const nothing: never = stateQuery;
				return nothing;
			}
		}
	}

	update(updateStep: ConnectionStepString, authorityGate?: PublicKey) {
		// Check that authorities match before updating state
		if (authorityGate && !this.authority.equals(authorityGate)) {
			return;
		}

		if (updateStep === 'NotConnected') {
			this.state = ConnectionStates.NotConnected;
			return;
		}

		this.state = this.state | ConnectionStateSteps[updateStep];
	}

	get NotConnected() {
		return this.is('NotConnected');
	}
	get AdapterConnected() {
		return this.is('AdapterConnected');
	}
	get ClientConnected() {
		return this.is('ClientConnected');
	}
	get BalanceLoaded() {
		return this.is('BalanceLoaded');
	}
	get FullyConnected() {
		return this.is('FullyConnected');
	}
	get SubaccountsSubscribed() {
		return this.is('SubaccountsSubscribed');
	}
}

/**
 * Creates an IWallet wrapper, with redundant methods. If a `walletPubKey` is passed in,
 * the `publicKey` will be based on that.
 */
const createPlaceholderIWallet = (walletPubKey?: PublicKey) => {
	const newKeypair = walletPubKey
		? new Keypair({
				publicKey: walletPubKey.toBytes(),
				secretKey: new Keypair().publicKey.toBytes(),
			})
		: new Keypair();

	const newWallet: IWalletV2 = {
		publicKey: newKeypair.publicKey,
		//@ts-ignore
		signTransaction: () => {
			return Promise.resolve();
		},
		//@ts-ignore
		signAllTransactions: () => {
			return Promise.resolve();
		},
		//@ts-ignore
		signMessage: () => {
			return Promise.resolve();
		},
	};

	return newWallet;
};

export { createPlaceholderIWallet };

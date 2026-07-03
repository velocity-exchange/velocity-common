import { ConfirmationStrategy, MarketStatus } from '@velocity-exchange/sdk';
import { Commitment, PublicKey } from '@solana/web3.js';

export const DEFAULT_ACCOUNT_LOADER_COMMITMENT: Commitment = 'confirmed';
export const DEFAULT_ACCOUNT_LOADER_POLLING_FREQUENCY_MS = 1000;
export const DEFAULT_TX_SENDER_RETRY_INTERVAL = 4000;
export const DEFAULT_TX_SENDER_CONFIRMATION_STRATEGY =
	ConfirmationStrategy.Combo;

export const SELECTED_MARKET_ACCOUNT_POLLING_CADENCE = 1_000;
export const USER_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE = 1_000;
export const USER_NOT_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE = 60_000;

export const DELISTED_MARKET_STATUSES = [
	MarketStatus.DELISTED,
	MarketStatus.SETTLEMENT,
];

export enum PollingCategory {
	SELECTED_MARKET = 'selected-market',
	USER_INVOLVED = 'user-involved',
	USER_NOT_INVOLVED = 'user-not-involved',
}

/**
 * Accounts that are frequently used for trading.
 * These accounts can be used to estimate priority fees.
 */
export const HIGH_ACTIVITY_MARKET_ACCOUNTS = [
	new PublicKey('8UJgxaiQx5nTrdDgph5FiahMmzduuLTLf5WmsPegYA6W'), // sol perp
	new PublicKey('6gMq3mRCKf8aP3ttTyYhuijVZ2LGi14oDsBbkgubfLB3'), // usdt
];

import {
	BN,
	MarketType,
	PositionDirection,
	PostOnlyParams,
	RevenueShareEscrowAccount,
} from '@velocity-exchange/sdk';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { OptionalAuctionParamsRequestInputs } from './dlobServer';
import { AuctionParamsFetchedCallback } from '../../../../utils/auctionParamsResponseMapper';

export type TxnOrSwiftResult<T extends boolean> = T extends true
	? void
	: Transaction | VersionedTransaction;

/**
 * Represents an additional isolated position deposit needed to top up
 * an under-collateralized isolated position before placing an order.
 */
export interface AdditionalIsolatedPositionDeposit {
	marketIndex: number;
	amount: BN;
}

/**
 * Override for isolated position deposits. When provided on order params,
 * skips auto-compute and uses these values directly.
 */
export interface IsolatedPositionDepositsOverride {
	/** The main deposit amount for this market's isolated position. */
	mainDeposit: BN;
	/** Additional deposits for other under-collateralized isolated positions. */
	additionalDeposits?: AdditionalIsolatedPositionDeposit[];
}

export type PlaceAndTakeParams =
	| {
			enable: false;
	  }
	| {
			enable: true;
			auctionDurationPercentage?: number;
			/**
			 * Optional override for the taker's decoded RevenueShareEscrow account.
			 * When omitted, it is fetched automatically for referred takers (whose escrow
			 * carries a referrer) so the program's fill-time enforcement can load it.
			 * Supply it to skip the fetch when the escrow is already cached.
			 */
			takerEscrow?: RevenueShareEscrowAccount;
	  };

export type NonMarketOrderType =
	| 'limit'
	| 'takeProfit'
	| 'stopLoss'
	| 'oracleLimit';

export interface LimitAuctionConfig {
	enable: boolean;
	dlobServerHttpUrl: string;
	auctionStartPriceOffset: number;
	oraclePrice?: BN; // used to calculate oracle price bands
	optionalLimitAuctionParams?: OptionalAuctionParamsRequestInputs;
	usePlaceAndTake?: {
		enable: boolean;
		takerEscrow?: RevenueShareEscrowAccount; // optional override; auto-fetched for referred takers
		auctionDurationPercentage?: number;
	};
	onAuctionParamsFetched?: AuctionParamsFetchedCallback;
}

export type BuilderParams = {
	builderIdx: number;
	builderFeeTenthBps: number;
};

export interface OptionalTriggerOrderParams {
	baseAssetAmount?: BN;
	triggerPrice: BN;
	limitPrice?: BN;
	reduceOnly?: boolean;
}

export interface LimitOrderParamsOrderConfig {
	orderType: Extract<NonMarketOrderType, 'limit'>;
	limitPrice: BN;
	bracketOrders?: {
		takeProfit?: OptionalTriggerOrderParams;
		stopLoss?: OptionalTriggerOrderParams;
	};
	/**
	 * Limit orders can have an optional auction that allows it to go through the auction process.
	 * Usually, the auction params are set up to the limit price, to allow for a possible improved
	 * fill price. This is useful for when a limit order is crossing the orderbook.
	 */
	limitAuction?: LimitAuctionConfig;
}

export interface OracleLimitOrderParamsOrderConfig {
	orderType: Extract<NonMarketOrderType, 'oracleLimit'>;
	oraclePriceOffset: BN;
}

export type SwiftLimitOrderParamsOrderConfig =
	| LimitOrderParamsOrderConfig
	| OracleLimitOrderParamsOrderConfig;

export interface NonMarketOrderParamsConfig {
	marketIndex: number;
	marketType: MarketType;
	direction: PositionDirection;
	baseAssetAmount: BN;
	reduceOnly?: boolean;
	postOnly?: PostOnlyParams;
	userOrderId?: number;
	/**
	 * The leverage to be used for this position.
	 * If different from current position's leverage, will add an instruction
	 * to update the position's maxMarginRatio before placing the order.
	 * Example: 5 for 5x leverage, 10 for 10x leverage
	 */
	positionMaxLeverage: number;
	orderConfig:
		| LimitOrderParamsOrderConfig
		| {
				orderType: Extract<NonMarketOrderType, 'takeProfit' | 'stopLoss'>;
				triggerPrice: BN;
				limitPrice?: BN;
		  }
		| {
				orderType: Extract<NonMarketOrderType, 'oracleLimit'>;
				oraclePriceOffset: BN;
		  };
}

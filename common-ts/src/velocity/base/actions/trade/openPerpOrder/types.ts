import {
	BN,
	MarketType,
	PositionDirection,
	PostOnlyParams,
	RevenueShareEscrowAccount,
} from '@velocity-exchange/sdk';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

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

/**
 * The taker's decoded RevenueShareEscrow. A take fetches it for a referred taker when it is
 * omitted, so passing it only skips that fetch.
 */
export type TakerEscrowOverride = RevenueShareEscrowAccount;

/** An oracle-offset limit is gone: the program refuses it, because it has no fixed price to rest at. */
export type NonMarketOrderType = 'limit' | 'takeProfit' | 'stopLoss';

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
	 * The caller judged that the limit crosses the book. A limit that is not post-only then
	 * takes, with the limit as its worst price, and its remainder rests. Otherwise it rests
	 * as a maker order.
	 */
	marketable?: boolean;
	takerEscrow?: TakerEscrowOverride;
	/**
	 * Unix seconds after which the order expires, on the chain's clock. A relay crank removes
	 * an expired order from the book. Absent means the order never expires.
	 */
	maxTs?: BN;
}

export type SwiftLimitOrderParamsOrderConfig = LimitOrderParamsOrderConfig;

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
		  };
}

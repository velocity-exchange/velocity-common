import {
	VelocityClient,
	User,
	BN,
	PositionDirection,
	SlotDurationMs,
} from '@velocity-exchange/sdk';
import {
	PublicKey,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import {
	prepSignAndSendSwiftOrder,
	prepSwiftOrderMessage,
	SwiftOrderOptions,
	SwiftOrderMessage,
} from '../openSwiftOrder';
import {
	fetchMarketOrderParams,
	MarketOrderQuote,
	MarketOrderQuoteInputs,
} from '../dlobServer';
import { WithTxnParams } from '../../../../types';
import {
	TxnOrSwiftResult,
	IsolatedPositionDepositsOverride,
	OptionalTriggerOrderParams,
	BuilderParams,
	TakerEscrowOverride,
} from '../types';
import { createPositionSetupIxs } from '../positionSetup';
import { resolveIsolatedPositionDepositsWithOverride } from '../isolatedPositionDeposit';
import {
	bracketTriggerOrderParams,
	createTriggerOrderIxs,
} from '../triggerOrders';

export interface OpenPerpMarketOrderBaseParams {
	velocityClient: VelocityClient;
	user: User;
	assetType: 'base' | 'quote';
	marketIndex: number;
	direction: PositionDirection;
	amount: BN;
	dlobServerHttpUrl: string;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	reduceOnly?: boolean;
	// mainly used for UI order identification
	userOrderId?: number;
	quoteInputs?: MarketOrderQuoteInputs;
	takerEscrow?: TakerEscrowOverride;
	bracketOrders?: {
		takeProfit?: OptionalTriggerOrderParams;
		stopLoss?: OptionalTriggerOrderParams;
	};
	/**
	 * Optional per-market leverage to set for this position.
	 * If provided and different from current position's leverage, will add an instruction
	 * to update the position's maxMarginRatio before placing the order.
	 * Example: 5 for 5x leverage, 10 for 10x leverage
	 */
	positionMaxLeverage: number;
	/**
	 * Position margin mode to use for the order.
	 * When 'isolated', auto-computes isolated position deposit from positionMaxLeverage,
	 * and any additional isolated position deposits need to replenish under-collateralized positions.
	 * If not provided, the position margin mode will be derived from the user's position margin mode,
	 * and if that does not exist, it will default to 'cross'.
	 */
	marginMode?: 'isolated' | 'cross';
	/**
	 * Pre-computed isolated position deposits override. When provided,
	 * skips auto-compute and uses these values directly.
	 */
	isolatedPositionDepositsOverride?: IsolatedPositionDepositsOverride;
	/**
	 * If provided, will override the main signer for the order. Otherwise, the main signer will be the user's authority.
	 * This is only applicable for non-SWIFT orders.
	 */
	mainSignerOverride?: PublicKey;
	/**
	 * Optional builder code parameters for revenue sharing.
	 *
	 * Prerequisites:
	 * - User must have initialized a RevenueShareEscrow account
	 * - Builder must be in the user's approved_builders list
	 * - builderFeeTenthBps must not exceed the builder's max_fee_tenth_bps
	 *
	 * @example
	 * ```typescript
	 * builderParams: {
	 *   builderIdx: 0,          // First builder in approved list
	 *   builderFeeTenthBps: 50  // 5 bps = 0.05%
	 * }
	 * ```
	 */
	builderParams?: BuilderParams;
	callbacks?: {
		onQuoteFetched?: (quote: MarketOrderQuote) => void;
	};
}

export interface OpenPerpMarketOrderBaseParamsWithSwift extends OpenPerpMarketOrderBaseParams {
	swiftOptions: SwiftOrderOptions;
}

export type OpenPerpMarketOrderParams<
	T extends boolean = boolean,
	S extends Omit<SwiftOrderOptions, 'swiftServerUrl'> = Omit<
		SwiftOrderOptions,
		'swiftServerUrl'
	>,
> = T extends true
	? OpenPerpMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions: S;
		}
	: OpenPerpMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions?: never;
		};

/** Quote the order, and stamp the caller's `userOrderId` on it. */
async function quoteMarketOrder(
	params: OpenPerpMarketOrderBaseParams
): Promise<MarketOrderQuote> {
	if (!params.amount || params.amount.isZero()) {
		throw new Error('Amount must be greater than zero');
	}

	const quote = await fetchMarketOrderParams({
		dlobServerHttpUrl: params.dlobServerHttpUrl,
		marketIndex: params.marketIndex,
		direction: params.direction,
		amount: params.amount,
		assetType: params.assetType,
		reduceOnly: params.reduceOnly,
		userOrderId: params.userOrderId,
		inputs: params.quoteInputs,
	});
	params.callbacks?.onQuoteFetched?.(quote);

	return quote;
}

async function prepSwiftMarketOrderData(params: OpenPerpMarketOrderBaseParams) {
	const quote = await quoteMarketOrder(params);
	const orderParams = {
		...quote.orderParams,
		userOrderId: params.userOrderId ?? 0,
	};

	return { userAccount: params.user.getUserAccountOrThrow(), orderParams };
}

/**
 * Creates and submits a Swift (signed message) order. Only available for perp orders.
 */
export async function createSwiftMarketOrder(
	params: OpenPerpMarketOrderBaseParamsWithSwift
): Promise<void> {
	const {
		velocityClient,
		user,
		marketIndex,
		amount,
		direction,
		bracketOrders,
		swiftOptions,
		positionMaxLeverage,
		marginMode,
		builderParams,
		slotDuration,
	} = params;

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		params.isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: amount,
			direction,
			positionMaxLeverage,
			marginMode,
			replenishUnderwaterPositions: false, // Swift doesn't support additional deposits. Will throw error if other isolated position shortfalls exists.
		}
	);

	const { userAccount, orderParams } = await prepSwiftMarketOrderData(params);

	await prepSignAndSendSwiftOrder({
		velocityClient,
		subAccountId: userAccount.subAccountId,
		userAccountPubKey: user.userAccountPublicKey,
		marketIndex,
		userSigningSlotBuffer: swiftOptions.userSigningSlotBuffer ?? 0,
		slotDuration,
		swiftOptions,
		orderParams: {
			main: orderParams,
			takeProfit: bracketOrders?.takeProfit,
			stopLoss: bracketOrders?.stopLoss,
			positionMaxLeverage,
			isolatedPositionDeposit: resolvedDeposits?.mainDeposit,
		},
		builderParams,
	});
}

export type CreateSwiftMarketOrderMessageParams = Omit<
	OpenPerpMarketOrderBaseParams,
	'mainSignerOverride'
> & {
	isDelegate?: boolean;
	userSigningSlotBuffer?: number;
};

/**
 * Prepares a Swift market order message without signing or sending it.
 * Quotes the order from the DLOB server and creates the prepared message.
 *
 * @returns The prepared SwiftOrderMessage ready for client-side signing and sending
 */
export async function createSwiftMarketOrderMessage(
	params: CreateSwiftMarketOrderMessageParams
): Promise<SwiftOrderMessage> {
	const {
		velocityClient,
		user,
		marketIndex,
		amount,
		direction,
		bracketOrders,
		positionMaxLeverage,
		marginMode,
		builderParams,
		isDelegate = false,
		userSigningSlotBuffer,
		slotDuration,
	} = params;

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		params.isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: amount,
			direction,
			positionMaxLeverage,
			marginMode,
			replenishUnderwaterPositions: false, // Swift doesn't support additional deposits. Will throw error if other isolated position shortfalls exists.
		}
	);

	const { userAccount, orderParams } = await prepSwiftMarketOrderData(params);

	return prepSwiftOrderMessage({
		velocityClient,
		subAccountId: userAccount.subAccountId,
		userAccountPubKey: user.userAccountPublicKey,
		marketIndex,
		userSigningSlotBuffer: userSigningSlotBuffer ?? 0,
		slotDuration,
		isDelegate,
		orderParams: {
			main: orderParams,
			takeProfit: bracketOrders?.takeProfit,
			stopLoss: bracketOrders?.stopLoss,
			positionMaxLeverage,
			isolatedPositionDeposit: resolvedDeposits?.mainDeposit,
		},
		builderParams,
	});
}

/**
 * The take of a market order. The quote names its worst price, and what does not fill
 * rests on the book there as a taker-origin order.
 */
export const createPlaceAndTakePerpMarketOrderIx = async (
	params: OpenPerpMarketOrderBaseParams
): Promise<TransactionInstruction> => {
	const quote = await quoteMarketOrder(params);
	const { velocityClient, user, builderParams, mainSignerOverride } = params;

	return velocityClient.getPlaceAndTakePerpOrderIx(
		{ ...quote.orderParams, userOrderId: params.userOrderId, ...builderParams },
		undefined,
		undefined,
		undefined,
		user.getUserAccountOrThrow().subAccountId,
		{ authority: mainSignerOverride },
		params.takerEscrow
	);
};

/**
 * The instructions of a perp market order: any leverage and isolated-margin setup, the take,
 * and the bracket triggers.
 *
 * @param userOrderId - the order ID in terms of incremental fills (usually 0). do NOT use the nextOrderId from the user account. values over 255 will cause the order to fail onchain.
 */
export const createOpenPerpMarketOrderIxs = async (
	params: OpenPerpMarketOrderBaseParams
): Promise<TransactionInstruction[]> => {
	const {
		velocityClient,
		user,
		marketIndex,
		direction,
		amount,
		bracketOrders,
		mainSignerOverride,
	} = params;

	if (!amount || amount.isZero()) {
		throw new Error('Amount must be greater than zero');
	}

	const [setupIxs, takeIx] = await Promise.all([
		createPositionSetupIxs(params, true),
		createPlaceAndTakePerpMarketOrderIx(params),
	]);
	const triggerIxs = await createTriggerOrderIxs({
		velocityClient,
		user,
		orderParams: bracketTriggerOrderParams({
			marketIndex,
			entryDirection: direction,
			entryBaseAssetAmount: amount,
			bracketOrders,
		}),
		mainSignerOverride,
	});

	return [...setupIxs, takeIx, ...triggerIxs];
};

/**
 * Creates a complete transaction for opening a perp market order.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will place the order
 * @param marketIndex - The perp market index to trade
 * @param direction - The direction of the trade (long/short)
 * @param amount - The amount to trade
 * @param quoteInputs - Slippage and price reference for the /marketOrderParams quote
 * @param dlobServerHttpUrl - Server URL for the /marketOrderParams quote
 * @param positionMaxLeverage - Optional per-market leverage (e.g., 5 for 5x). If provided and different from current,
 *                              includes an instruction to update the position's maxMarginRatio.
 *
 * @returns Promise resolving to a built transaction ready for signing (Transaction or VersionedTransaction)
 */
export const createOpenPerpMarketOrderTxn = async (
	params: WithTxnParams<OpenPerpMarketOrderBaseParams>
): Promise<Transaction | VersionedTransaction> => {
	const { velocityClient } = params;

	// Regular order flow - create transaction instruction and build transaction
	const placeOrderIxs = await createOpenPerpMarketOrderIxs(params);
	const openPerpMarketOrderTxn =
		await velocityClient.txHandler.buildTransaction({
			instructions: placeOrderIxs,
			txVersion: 0,
			connection: velocityClient.connection,
			preFlightCommitment: 'confirmed',
			fetchAllMarketLookupTableAccounts:
				velocityClient.fetchAllLookupTableAccounts.bind(velocityClient),
			txParams: params.txParams,
		});

	return openPerpMarketOrderTxn;
};

/**
 * Creates a transaction or swift order for a perp market order.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will place the order
 * @param marketIndex - The perp market index to trade
 * @param direction - The direction of the trade (long/short)
 * @param amount - The amount to trade
 * @param quoteInputs - Slippage and price reference for the /marketOrderParams quote
 * @param dlobServerHttpUrl - Server URL for the /marketOrderParams quote
 * @param useSwift - Whether to use Swift (signed message) orders instead of regular transactions
 * @param swiftOptions - Options for Swift (signed message) orders. Required if useSwift is true
 * @param userOrderId - The user order id for UI identification
 * @param positionMaxLeverage - Optional per-market leverage (e.g., 5 for 5x). Only supported for regular transactions (not Swift).
 *
 * @returns Promise resolving to a built transaction ready for signing (Transaction or VersionedTransaction)
 */
export const createOpenPerpMarketOrder = async <T extends boolean>(
	params: WithTxnParams<OpenPerpMarketOrderParams<T, SwiftOrderOptions>>
): Promise<TxnOrSwiftResult<T>> => {
	const { useSwift, swiftOptions, ...rest } = params;

	// If useSwift is true, return the Swift result directly
	if (useSwift) {
		if (!swiftOptions) {
			throw new Error('swiftOptions is required when useSwift is true');
		}

		const swiftOrderResult = await createSwiftMarketOrder({
			...rest,
			swiftOptions,
		});

		return swiftOrderResult as TxnOrSwiftResult<T>;
	}

	const openPerpMarketOrderTxn = await createOpenPerpMarketOrderTxn(rest);

	return openPerpMarketOrderTxn as TxnOrSwiftResult<T>;
};

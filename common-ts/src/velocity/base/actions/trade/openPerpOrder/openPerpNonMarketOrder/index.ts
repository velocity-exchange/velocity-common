import {
	VelocityClient,
	User,
	BN,
	MarketType,
	PostOnlyParams,
	OptionalOrderParams,
	OrderType,
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
	buildNonMarketOrderParams,
	resolveBaseAssetAmount,
} from '../../../../../utils/orderParams';
import { ENUM_UTILS } from '../../../../../../utils';
import {
	TxnOrSwiftResult,
	SwiftLimitOrderParamsOrderConfig,
	NonMarketOrderParamsConfig,
	IsolatedPositionDepositsOverride,
	BuilderParams,
} from '../types';
import { WithTxnParams } from '../../../../types';
import { resolveIsolatedPositionDepositsWithOverride } from '../isolatedPositionDeposit';
import { createPositionSetupIxs } from '../positionSetup';
import {
	bracketTriggerOrderParams,
	createTriggerOrderIxs,
} from '../triggerOrders';

export interface OpenPerpNonMarketOrderBaseParams extends Omit<
	NonMarketOrderParamsConfig,
	'marketType' | 'baseAssetAmount'
> {
	velocityClient: VelocityClient;
	user: User;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	// Either new approach
	amount?: BN;
	assetType?: 'base' | 'quote';
	// Or legacy approach
	baseAssetAmount?: BN;
	// Common optional params
	reduceOnly?: boolean;
	postOnly?: PostOnlyParams;
	userOrderId?: number;
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
	 */
	builderParams?: BuilderParams;
}

export interface OpenPerpNonMarketOrderParamsWithSwift extends OpenPerpNonMarketOrderBaseParams {
	swiftOptions: SwiftOrderOptions;
}

export type OpenPerpNonMarketOrderParams<
	T extends boolean = boolean,
	S extends Omit<SwiftOrderOptions, 'swiftServerUrl'> = Omit<
		SwiftOrderOptions,
		'swiftServerUrl'
	>,
> = T extends true
	? OpenPerpNonMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions: S;
		}
	: OpenPerpNonMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions?: never;
		};

/**
 * Instructions for several non-market orders at once. Each limit rests on the book as a
 * maker order. The triggers arm together, under one margin check and one sync.
 */
export const createMultipleOpenPerpNonMarketOrderIxs = async (params: {
	velocityClient: VelocityClient;
	user: User;
	orderParamsConfigs: NonMarketOrderParamsConfig[];
	/**
	 * If provided, will override the main signer for the order. Otherwise, the main signer will be the user's authority.
	 */
	mainSignerOverride?: PublicKey;
	/**
	 * Optional builder code parameters for revenue sharing, applied to every order in the batch.
	 */
	builderParams?: BuilderParams;
}): Promise<TransactionInstruction[]> => {
	const { velocityClient, user, mainSignerOverride, builderParams } = params;
	const orders = params.orderParamsConfigs.map((config) => ({
		...buildNonMarketOrderParams(config),
		...builderParams,
	}));
	const limits = orders.filter((order) => !isTriggerOrder(order));
	const triggers = orders.filter(isTriggerOrder);

	const [makeIxs, triggerIxs] = await Promise.all([
		Promise.all(
			limits.map((order) =>
				createMakeIx(velocityClient, user, order, mainSignerOverride)
			)
		),
		createTriggerOrderIxs({
			velocityClient,
			user,
			orderParams: triggers,
			mainSignerOverride,
		}),
	]);

	return [...makeIxs, ...triggerIxs];
};

function isTriggerOrder(order: OptionalOrderParams): boolean {
	return (
		ENUM_UTILS.match(order.orderType, OrderType.TRIGGER_MARKET) ||
		ENUM_UTILS.match(order.orderType, OrderType.TRIGGER_LIMIT)
	);
}

function createMakeIx(
	velocityClient: VelocityClient,
	user: User,
	order: OptionalOrderParams,
	mainSignerOverride?: PublicKey
): Promise<TransactionInstruction> {
	return velocityClient.getPlaceAndMakePerpOrderIx(
		order,
		undefined,
		user.getUserAccountOrThrow().subAccountId,
		{ authority: mainSignerOverride }
	);
}

/**
 * The instructions of a non-market order and its bracket triggers. A limit rests as a maker
 * order, unless the caller marks it marketable and it is not post-only. It then takes, with
 * the limit as its worst price, and its remainder rests on the book.
 */
export const createOpenPerpNonMarketOrderIxs = async (
	params: OpenPerpNonMarketOrderBaseParams
): Promise<TransactionInstruction[]> => {
	const {
		velocityClient,
		user,
		marketIndex,
		direction,
		reduceOnly = false,
		postOnly = PostOnlyParams.NONE,
		orderConfig,
		userOrderId = 0,
		mainSignerOverride,
		builderParams,
	} = params;
	const baseAssetAmount = resolveNonMarketBaseAssetAmount(params);

	const order = {
		...buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction,
			baseAssetAmount,
			orderConfig,
			reduceOnly,
			postOnly,
			userOrderId,
		}),
		...builderParams,
	};
	const brackets = bracketTriggerOrderParams({
		marketIndex,
		entryDirection: direction,
		entryBaseAssetAmount: baseAssetAmount,
		bracketOrders:
			'bracketOrders' in orderConfig ? orderConfig.bracketOrders : undefined,
	});
	const isTrigger = isTriggerOrder(order);
	const takes =
		orderConfig.orderType === 'limit' &&
		orderConfig.marketable === true &&
		ENUM_UTILS.match(postOnly, PostOnlyParams.NONE);

	const [setupIxs, mainIxs, triggerIxs] = await Promise.all([
		createPositionSetupIxs({ ...params, amount: baseAssetAmount }, true),
		isTrigger
			? Promise.resolve([])
			: takes
				? velocityClient
						.getPlaceAndTakePerpOrderIx(
							order,
							undefined,
							undefined,
							undefined,
							user.getUserAccountOrThrow().subAccountId,
							{ authority: mainSignerOverride },
							orderConfig.takerEscrow
						)
						.then((ix) => [ix])
				: createMakeIx(velocityClient, user, order, mainSignerOverride).then(
						(ix) => [ix]
					),
		createTriggerOrderIxs({
			velocityClient,
			user,
			orderParams: isTrigger ? [order, ...brackets] : brackets,
			mainSignerOverride,
		}),
	]);

	return [...setupIxs, ...mainIxs, ...triggerIxs];
};

/** Supports both the amount and asset type pair and the legacy base asset amount. */
function resolveNonMarketBaseAssetAmount(
	params: OpenPerpNonMarketOrderBaseParams
): BN {
	const baseAssetAmount = resolveBaseAssetAmount({
		amount: params.amount,
		assetType: params.assetType,
		baseAssetAmount: params.baseAssetAmount,
		limitPrice:
			'limitPrice' in params.orderConfig
				? params.orderConfig.limitPrice
				: undefined,
	});
	if (!baseAssetAmount || baseAssetAmount.isZero()) {
		throw new Error('Final base asset amount must be greater than zero');
	}

	return baseAssetAmount;
}

/** Shared prep logic for swift limit orders. */
async function prepSwiftLimitOrderData(
	params: OpenPerpNonMarketOrderBaseParams & {
		orderConfig: SwiftLimitOrderParamsOrderConfig;
	}
) {
	const { user, marketIndex, orderConfig } = params;
	if (orderConfig.limitPrice.isZero()) {
		throw new Error('LIMIT orders require limitPrice');
	}

	const orderParams = buildNonMarketOrderParams({
		marketIndex,
		marketType: MarketType.PERP,
		direction: params.direction,
		baseAssetAmount: resolveNonMarketBaseAssetAmount(params),
		orderConfig,
		reduceOnly: params.reduceOnly,
		postOnly: params.postOnly,
		userOrderId: params.userOrderId,
	});

	return {
		userAccount: user.getUserAccountOrThrow(),
		orderParams,
		bracketOrders: orderConfig.bracketOrders,
	};
}

export const createSwiftLimitOrder = async (
	params: OpenPerpNonMarketOrderParamsWithSwift & {
		orderConfig: SwiftLimitOrderParamsOrderConfig;
	}
): Promise<void> => {
	const { velocityClient, user, marketIndex, swiftOptions } = params;

	const { userAccount, orderParams, bracketOrders } =
		await prepSwiftLimitOrderData(params);

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		params.isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: orderParams.baseAssetAmount,
			direction: orderParams.direction,
			positionMaxLeverage: params.positionMaxLeverage,
			marginMode: params.marginMode,
			replenishUnderwaterPositions: false, // Swift doesn't support additional deposits, so throw on underwater positions
		}
	);

	await prepSignAndSendSwiftOrder({
		velocityClient,
		subAccountId: userAccount.subAccountId,
		userAccountPubKey: user.userAccountPublicKey,
		marketIndex,
		userSigningSlotBuffer: swiftOptions.userSigningSlotBuffer ?? 0,
		slotDuration: params.slotDuration,
		swiftOptions,
		orderParams: {
			main: orderParams,
			takeProfit: bracketOrders?.takeProfit,
			stopLoss: bracketOrders?.stopLoss,
			positionMaxLeverage: params.positionMaxLeverage,
			isolatedPositionDeposit: resolvedDeposits?.mainDeposit,
		},
		builderParams: params.builderParams,
	});
};

export type CreateSwiftLimitOrderMessageParams = Omit<
	OpenPerpNonMarketOrderBaseParams,
	'mainSignerOverride'
> & {
	orderConfig: SwiftLimitOrderParamsOrderConfig;
	isDelegate?: boolean;
	userSigningSlotBuffer?: number;
};

/**
 * Prepares a Swift limit order message without signing or sending it.
 *
 * @returns The prepared SwiftOrderMessage ready for client-side signing and sending
 */
export const createSwiftLimitOrderMessage = async (
	params: CreateSwiftLimitOrderMessageParams
): Promise<SwiftOrderMessage> => {
	const {
		velocityClient,
		user,
		marketIndex,
		isDelegate = false,
		userSigningSlotBuffer,
	} = params;

	const { userAccount, orderParams, bracketOrders } =
		await prepSwiftLimitOrderData(params);

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		params.isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: orderParams.baseAssetAmount,
			direction: orderParams.direction,
			positionMaxLeverage: params.positionMaxLeverage,
			marginMode: params.marginMode,
			replenishUnderwaterPositions: false, // Swift doesn't support additional deposits, so throw on underwater positions
		}
	);

	return prepSwiftOrderMessage({
		velocityClient,
		subAccountId: userAccount.subAccountId,
		userAccountPubKey: user.userAccountPublicKey,
		marketIndex,
		userSigningSlotBuffer: userSigningSlotBuffer ?? 0,
		slotDuration: params.slotDuration,
		isDelegate,
		orderParams: {
			main: orderParams,
			takeProfit: bracketOrders?.takeProfit,
			stopLoss: bracketOrders?.stopLoss,
			positionMaxLeverage: params.positionMaxLeverage,
			isolatedPositionDeposit: resolvedDeposits?.mainDeposit,
		},
		builderParams: params.builderParams,
	});
};

export const createOpenPerpNonMarketOrderTxn = async (
	params: WithTxnParams<OpenPerpNonMarketOrderBaseParams>
): Promise<Transaction | VersionedTransaction> => {
	const { velocityClient } = params;

	const instructions = await createOpenPerpNonMarketOrderIxs(params);

	const openPerpNonMarketOrderTxn = await velocityClient.buildTransaction(
		instructions,
		params.txParams
	);

	return openPerpNonMarketOrderTxn;
};

export const createOpenPerpNonMarketOrder = async <T extends boolean>(
	params: WithTxnParams<OpenPerpNonMarketOrderParams<T, SwiftOrderOptions>>
): Promise<TxnOrSwiftResult<T>> => {
	const { swiftOptions, useSwift, orderConfig } = params;

	// If useSwift is true, return the Swift result directly
	if (useSwift) {
		if (orderConfig.orderType !== 'limit') {
			throw new Error('Only limit orders are supported with Swift');
		}

		if (!swiftOptions) {
			throw new Error('swiftOptions is required when useSwift is true');
		}

		const swiftOrderResult = await createSwiftLimitOrder({
			...params,
			swiftOptions,
			orderConfig,
		});

		return swiftOrderResult as TxnOrSwiftResult<T>;
	}

	const marketOrderTxn = await createOpenPerpNonMarketOrderTxn(params);

	return marketOrderTxn as TxnOrSwiftResult<T>;
};

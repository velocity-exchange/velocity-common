import {
	VelocityClient,
	User,
	BN,
	MarketType,
	PostOnlyParams,
	OptionalOrderParams,
	PositionDirection,
	OrderType,
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
import { createPlaceAndTakePerpMarketOrderIx } from '../openPerpMarketOrder';
import {
	TxnOrSwiftResult,
	LimitAuctionConfig,
	LimitOrderParamsOrderConfig,
	SwiftLimitOrderParamsOrderConfig,
	NonMarketOrderParamsConfig,
	IsolatedPositionDepositsOverride,
	BuilderParams,
} from '../types';
import { WithTxnParams } from '../../../../types';
import { getPositionMaxLeverageIxIfNeeded } from '../positionMaxLeverage';
import { getLimitAuctionOrderParams } from '../auction';
import {
	getIsolatedPositionDepositIxIfNeeded,
	resolveIsolatedPositionDepositsWithOverride,
} from '../isolatedPositionDeposit';
import { logger } from '../../../../../../utils/logger';

export interface OpenPerpNonMarketOrderBaseParams
	extends Omit<NonMarketOrderParamsConfig, 'marketType' | 'baseAssetAmount'> {
	velocityClient: VelocityClient;
	user: User;
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

export interface OpenPerpNonMarketOrderParamsWithSwift
	extends OpenPerpNonMarketOrderBaseParams {
	swiftOptions: SwiftOrderOptions;
}

export type OpenPerpNonMarketOrderParams<
	T extends boolean = boolean,
	S extends Omit<SwiftOrderOptions, 'swiftServerUrl'> = Omit<
		SwiftOrderOptions,
		'swiftServerUrl'
	>
> = T extends true
	? OpenPerpNonMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions: S;
	  }
	: OpenPerpNonMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions?: never;
	  };

// TODO: add isolated margin?
/**
 * Creates a transaction instruction to open multiple non-market orders.
 */
export const createMultipleOpenPerpNonMarketOrderIx = async (params: {
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
}): Promise<TransactionInstruction> => {
	const {
		velocityClient,
		orderParamsConfigs,
		mainSignerOverride,
		builderParams,
	} = params;

	const orderParams = orderParamsConfigs.map((config) => ({
		...buildNonMarketOrderParams(config),
		...(builderParams ?? {}),
	}));

	const placeOrderIx = await velocityClient.getPlaceOrdersIx(
		orderParams,
		undefined,
		{
			authority: mainSignerOverride,
		}
	);
	return placeOrderIx;
};

/**
 * Creates a transaction instruction to open a non-market order.
 * Allows for bracket orders to be opened in the same transaction.
 *
 * If `limitAuction` is enabled, a placeAndTake order is created to simulate a market auction order,
 * with the end price being the limit price.
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
		positionMaxLeverage,
		marginMode,
		mainSignerOverride,
		isolatedPositionDepositsOverride,
		builderParams,
	} = params;
	// Support both new (amount + assetType) and legacy (baseAssetAmount) approaches
	const finalBaseAssetAmount = resolveBaseAssetAmount({
		amount: 'amount' in params ? params.amount : undefined,
		assetType: 'assetType' in params ? params.assetType : undefined,
		baseAssetAmount:
			'baseAssetAmount' in params ? params.baseAssetAmount : undefined,
		limitPrice:
			'limitPrice' in params.orderConfig
				? params.orderConfig.limitPrice
				: undefined,
	});

	if (!finalBaseAssetAmount || finalBaseAssetAmount.isZero()) {
		throw new Error('Final base asset amount must be greater than zero');
	}

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: finalBaseAssetAmount,
			direction,
			positionMaxLeverage,
			marginMode,
			replenishUnderwaterPositions: true,
		}
	);

	const mainIsolatedPositionDeposit = resolvedDeposits?.mainDeposit;
	const resolvedAdditionalDeposits =
		resolvedDeposits?.additionalIsolatedPositionDeposits;

	const allOrders: OptionalOrderParams[] = [];
	const allIxs: TransactionInstruction[] = [];

	// Fetch all deposit/leverage ixs in parallel
	const [leverageIx, additionalDepositIxs, isolatedPositionDepositIx] =
		await Promise.all([
			getPositionMaxLeverageIxIfNeeded(
				velocityClient,
				user,
				marketIndex,
				positionMaxLeverage,
				mainSignerOverride
			),
			resolvedAdditionalDeposits?.length
				? Promise.all(
						resolvedAdditionalDeposits.map((deposit) =>
							getIsolatedPositionDepositIxIfNeeded(
								velocityClient,
								user,
								deposit.marketIndex,
								deposit.amount,
								mainSignerOverride
							)
						)
				  )
				: Promise.resolve([] as (TransactionInstruction | undefined)[]),
			getIsolatedPositionDepositIxIfNeeded(
				velocityClient,
				user,
				marketIndex,
				mainIsolatedPositionDeposit,
				mainSignerOverride
			),
		]);

	if (leverageIx) {
		allIxs.push(leverageIx);
	}
	for (const ix of additionalDepositIxs) {
		if (ix) {
			allIxs.push(ix);
		}
	}
	if (isolatedPositionDepositIx) {
		allIxs.push(isolatedPositionDepositIx);
	}

	// handle limit auction
	if (
		orderConfig.orderType === 'limit' &&
		orderConfig.limitAuction?.enable &&
		ENUM_UTILS.match(postOnly, PostOnlyParams.NONE)
	) {
		const limitAuctionOrderParams = await getLimitAuctionOrderParams({
			...params,
			marketType: MarketType.PERP,
			baseAssetAmount: finalBaseAssetAmount,
			orderConfig: orderConfig as LimitOrderParamsOrderConfig & {
				limitAuction: LimitAuctionConfig;
			},
		});

		let createdPlaceAndTakeIx = false;

		// if it is a limit auction order, we create a placeAndTake order to simulate a market order.
		// this is useful when a limit order is crossing, and we want to achieve the best fill price through a placeAndTake.
		// falls back to limit order with auction params if the placeAndTake order creation fails
		if (
			limitAuctionOrderParams.auctionDuration &&
			limitAuctionOrderParams.auctionDuration > 0 &&
			orderConfig.limitAuction?.usePlaceAndTake?.enable
		) {
			try {
				const placeAndTakeIx = await createPlaceAndTakePerpMarketOrderIx({
					assetType: 'base',
					amount: finalBaseAssetAmount,
					orderType: OrderType.LIMIT,
					price: orderConfig.limitPrice,
					direction,
					dlobServerHttpUrl: orderConfig.limitAuction.dlobServerHttpUrl,
					marketIndex,
					velocityClient,
					user,
					userOrderId,
					reduceOnly,
					positionMaxLeverage,
					optionalAuctionParamsInputs:
						orderConfig.limitAuction.optionalLimitAuctionParams,
					auctionDurationPercentage:
						orderConfig.limitAuction.usePlaceAndTake.auctionDurationPercentage,
					takerEscrow: orderConfig.limitAuction.usePlaceAndTake.takerEscrow,
					builderParams,
				});
				allIxs.push(placeAndTakeIx);
				createdPlaceAndTakeIx = true;
			} catch (e) {
				logger.error(
					'Failed to create placeAndTake order for limit auction order',
					e
				);
				createdPlaceAndTakeIx = false;
			}
		}

		// fallback to normal limit order with auction params
		if (!createdPlaceAndTakeIx) {
			allOrders.push({
				...limitAuctionOrderParams,
				...(builderParams ?? {}),
			});
		}
	} else {
		const orderParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction,
			baseAssetAmount: finalBaseAssetAmount,
			orderConfig,
			reduceOnly,
			postOnly,
			userOrderId,
		});

		allOrders.push({
			...orderParams,
			...(builderParams ?? {}),
		});
	}

	const bracketOrdersDirection = ENUM_UTILS.match(
		direction,
		PositionDirection.LONG
	)
		? PositionDirection.SHORT
		: PositionDirection.LONG;

	if ('bracketOrders' in orderConfig && orderConfig.bracketOrders?.takeProfit) {
		const takeProfitParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction: bracketOrdersDirection,
			baseAssetAmount:
				orderConfig.bracketOrders.takeProfit.baseAssetAmount ??
				finalBaseAssetAmount,
			orderConfig: {
				orderType: 'takeProfit',
				triggerPrice: orderConfig.bracketOrders.takeProfit.triggerPrice,
				limitPrice: orderConfig.bracketOrders.takeProfit.limitPrice,
			},
			reduceOnly: orderConfig.bracketOrders.takeProfit.reduceOnly ?? true,
		});
		allOrders.push(takeProfitParams);
	}

	if ('bracketOrders' in orderConfig && orderConfig.bracketOrders?.stopLoss) {
		const stopLossParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction: bracketOrdersDirection,
			baseAssetAmount:
				orderConfig.bracketOrders.stopLoss.baseAssetAmount ??
				finalBaseAssetAmount,
			orderConfig: {
				orderType: 'stopLoss',
				triggerPrice: orderConfig.bracketOrders.stopLoss.triggerPrice,
				limitPrice: orderConfig.bracketOrders.stopLoss.limitPrice,
			},
			reduceOnly: orderConfig.bracketOrders.stopLoss.reduceOnly ?? true,
		});
		allOrders.push(stopLossParams);
	}

	if (allOrders.length > 0) {
		const placeOrderIx = await velocityClient.getPlaceOrdersIx(
			allOrders,
			undefined,
			{
				authority: mainSignerOverride,
			}
		);
		allIxs.push(placeOrderIx);
	}

	return allIxs;
};

/**
 * Shared prep logic for swift limit orders: validates limit price, resolves base asset amount,
 * computes order params (with or without limit auction), and resolves the user account.
 */
async function prepSwiftLimitOrderData(
	params: OpenPerpNonMarketOrderBaseParams & {
		orderConfig: SwiftLimitOrderParamsOrderConfig;
	}
) {
	const { user, marketIndex, orderConfig } = params;

	let orderParams: OptionalOrderParams;

	if (orderConfig.orderType === 'limit') {
		const limitPrice = orderConfig.limitPrice;

		if (limitPrice.isZero()) {
			throw new Error('LIMIT orders require limitPrice');
		}

		const finalBaseAssetAmount = resolveBaseAssetAmount({
			amount: 'amount' in params ? params.amount : undefined,
			assetType: 'assetType' in params ? params.assetType : undefined,
			baseAssetAmount:
				'baseAssetAmount' in params ? params.baseAssetAmount : undefined,
			limitPrice,
		});

		orderParams = orderConfig.limitAuction?.enable
			? await getLimitAuctionOrderParams({
					...params,
					marketType: MarketType.PERP,
					baseAssetAmount: finalBaseAssetAmount,
					orderConfig: orderConfig as LimitOrderParamsOrderConfig & {
						limitAuction: LimitAuctionConfig;
					},
			  })
			: buildNonMarketOrderParams({
					marketIndex,
					marketType: MarketType.PERP,
					direction: params.direction,
					baseAssetAmount: finalBaseAssetAmount,
					orderConfig,
					reduceOnly: params.reduceOnly,
					postOnly: params.postOnly,
					userOrderId: params.userOrderId,
			  });
	} else if (orderConfig.orderType === 'oracleLimit') {
		if (orderConfig.oraclePriceOffset.isZero()) {
			throw new Error('ORACLE_LIMIT orders require oraclePriceOffset');
		}

		const finalBaseAssetAmount = resolveBaseAssetAmount({
			amount: 'amount' in params ? params.amount : undefined,
			assetType: 'assetType' in params ? params.assetType : undefined,
			baseAssetAmount:
				'baseAssetAmount' in params ? params.baseAssetAmount : undefined,
		});

		orderParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction: params.direction,
			baseAssetAmount: finalBaseAssetAmount,
			orderConfig,
			reduceOnly: params.reduceOnly,
			postOnly: params.postOnly,
			userOrderId: params.userOrderId,
		});
	} else {
		throw new Error(`Unsupported orderType for Swift limit order`);
	}

	const userAccount = user.getUserAccountOrThrow();
	const bracketOrders =
		orderConfig.orderType === 'limit' ? orderConfig.bracketOrders : undefined;

	return { userAccount, orderParams, bracketOrders };
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
		if (
			orderConfig.orderType !== 'limit' &&
			orderConfig.orderType !== 'oracleLimit'
		) {
			throw new Error(
				'Only limit and oracle limit orders are supported with Swift'
			);
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

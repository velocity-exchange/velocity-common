import {
	VelocityClient,
	User,
	BN,
	PositionDirection,
	OptionalOrderParams,
	MarketType,
	getUserStatsAccountPublicKey,
	OrderType,
	RevenueShareEscrowAccount,
	fetchRevenueShareEscrowAccount,
	escrowHasReferrer,
} from '@velocity-exchange/sdk';
import {
	PublicKey,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { ENUM_UTILS } from '../../../../../../utils';
import {
	prepSignAndSendSwiftOrder,
	prepSwiftOrderMessage,
	SwiftOrderOptions,
	SwiftOrderMessage,
} from '../openSwiftOrder';
import { buildNonMarketOrderParams } from '../../../../../utils/orderParams';
import {
	fetchAuctionOrderParams,
	fetchTopMakers,
	OptionalAuctionParamsRequestInputs,
} from '../dlobServer';
import { WithTxnParams } from '../../../../types';
import {
	TxnOrSwiftResult,
	IsolatedPositionDepositsOverride,
	PlaceAndTakeParams,
	OptionalTriggerOrderParams,
	BuilderParams,
} from '../types';
import { NoTopMakersError } from '../../../../../Velocity/constants/errors';
import { getPositionMaxLeverageIxIfNeeded } from '../positionMaxLeverage';
import { AuctionParamsFetchedCallback } from '../../../../../utils/auctionParamsResponseMapper';
import {
	getIsolatedPositionDepositIxIfNeeded,
	resolveIsolatedPositionDepositsWithOverride,
} from '../isolatedPositionDeposit';

export interface OpenPerpMarketOrderBaseParams {
	velocityClient: VelocityClient;
	user: User;
	assetType: 'base' | 'quote';
	marketIndex: number;
	direction: PositionDirection;
	amount: BN;
	dlobServerHttpUrl: string;
	reduceOnly?: boolean;
	// mainly used for UI order identification
	userOrderId?: number;
	placeAndTake?: PlaceAndTakeParams;
	optionalAuctionParamsInputs?: OptionalAuctionParamsRequestInputs;
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
		onAuctionParamsFetched?: AuctionParamsFetchedCallback;
	};
}

export interface OpenPerpMarketOrderBaseParamsWithSwift
	extends Omit<OpenPerpMarketOrderBaseParams, 'placeAndTake'> {
	swiftOptions: SwiftOrderOptions;
}

export type OpenPerpMarketOrderParams<
	T extends boolean = boolean,
	S extends Omit<SwiftOrderOptions, 'swiftServerUrl'> = Omit<
		SwiftOrderOptions,
		'swiftServerUrl'
	>
> = T extends true
	? OpenPerpMarketOrderBaseParams & {
			useSwift: T;
			swiftOptions: S;
			placeAndTake?: never;
	  }
	: OpenPerpMarketOrderBaseParams & {
			useSwift: T;
			placeAndTake?: PlaceAndTakeParams;
			swiftOptions?: never;
	  };
/**
 * Shared prep logic for swift market orders: validates input, fetches auction params,
 * computes bit flags, and resolves the user account.
 */
async function prepSwiftMarketOrderData(params: OpenPerpMarketOrderBaseParams) {
	const {
		velocityClient,
		user,
		assetType,
		marketIndex,
		direction,
		amount,
		reduceOnly,
		dlobServerHttpUrl,
		optionalAuctionParamsInputs,
		userOrderId = 0,
		callbacks,
	} = params;

	if (amount.isZero()) {
		throw new Error('Amount must be greater than zero');
	}

	const { orderParams: fetchedOrderParams } = await fetchAuctionOrderParams({
		velocityClient,
		user,
		assetType,
		marketIndex,
		marketType: MarketType.PERP,
		direction,
		amount,
		dlobServerHttpUrl,
		optionalAuctionParamsInputs,
		reduceOnly,
		onAuctionParamsFetched: callbacks?.onAuctionParamsFetched,
	});

	const orderParams = {
		...fetchedOrderParams,
		userOrderId,
	};

	const userAccount = user.getUserAccountOrThrow();

	return { userAccount, orderParams };
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
	'placeAndTake' | 'mainSignerOverride'
> & {
	isDelegate?: boolean;
	userSigningSlotBuffer?: number;
};

/**
 * Prepares a Swift market order message without signing or sending it.
 * Fetches auction params from the DLOB server and creates the prepared message.
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
 * Creates a placeAndTake transaction instruction.
 * Fallbacks to a regular market order if no top makers are found.
 */
export const createPlaceAndTakePerpMarketOrderIx = async ({
	assetType,
	direction,
	dlobServerHttpUrl,
	marketIndex,
	velocityClient,
	user,
	userOrderId,
	amount,
	orderType,
	price,
	reduceOnly,
	auctionDurationPercentage,
	optionalAuctionParamsInputs,
	mainSignerOverride,
	callbacks,
	takerEscrow,
	builderParams,
}: Omit<
	OpenPerpMarketOrderBaseParams,
	'marginMode' | 'isolatedPositionDepositsOverride'
> & {
	orderType?: OrderType;
	price?: BN;
	direction: PositionDirection;
	dlobServerHttpUrl: string;
	marketIndex: number;
	velocityClient: VelocityClient;
	user: User;
	auctionDurationPercentage?: number;
	takerEscrow?: RevenueShareEscrowAccount;
}) => {
	const counterPartySide = ENUM_UTILS.match(direction, PositionDirection.LONG)
		? 'ask'
		: 'bid';

	const [fetchedResult, topMakersResult, resolvedTakerEscrow] =
		await Promise.all([
			fetchAuctionOrderParams({
				velocityClient,
				user,
				assetType,
				marketIndex,
				marketType: MarketType.PERP,
				direction,
				amount,
				reduceOnly,
				dlobServerHttpUrl,
				optionalAuctionParamsInputs,
				onAuctionParamsFetched: callbacks?.onAuctionParamsFetched,
			}),
			fetchTopMakers({
				dlobServerHttpUrl,
				marketIndex,
				marketType: MarketType.PERP,
				side: counterPartySide,
				limit: 4,
			}),
			// place_and_take fills the placing user's own order in-instruction, so the
			// taker's RevenueShareEscrow must be attached or the program rejects the fill
			// with UnableToLoadRevenueShareAccount. Enforcement triggers when the order
			// carries a builder code or the escrow has a referrer. Honor a caller-supplied
			// escrow, otherwise fetch it and only attach it when one of those holds.
			(async (): Promise<RevenueShareEscrowAccount | undefined> => {
				if (takerEscrow) {
					return takerEscrow;
				}
				const escrow = await fetchRevenueShareEscrowAccount(
					velocityClient.connection,
					velocityClient.program,
					user.getUserAccountOrThrow().authority
				);
				return escrow && (escrowHasReferrer(escrow) || !!builderParams)
					? escrow
					: undefined;
			})(),
		]);

	const fetchedOrderParams = fetchedResult.orderParams;

	fetchedOrderParams.userOrderId = userOrderId;

	if (orderType) {
		fetchedOrderParams.orderType = orderType;
	}

	if (price) {
		fetchedOrderParams.price = price;
		fetchedOrderParams.auctionEndPrice = price;
	}

	if (!topMakersResult || topMakersResult.length === 0) {
		throw new NoTopMakersError('No top makers found', fetchedOrderParams);
	}

	const topMakersInfo = topMakersResult.map((maker) => ({
		maker: maker.userAccountPubKey,
		makerUserAccount: maker.userAccount,
		makerStats: getUserStatsAccountPublicKey(
			velocityClient.program.programId,
			maker.userAccount.authority
		),
	}));

	const placeAndTakeIx = await velocityClient.getPlaceAndTakePerpOrderIx(
		{ ...fetchedOrderParams, ...(builderParams ?? {}) },
		topMakersInfo,
		undefined,
		auctionDurationPercentage,
		user.getUserAccountOrThrow().subAccountId,
		{
			authority: mainSignerOverride,
		},
		resolvedTakerEscrow
	);

	return placeAndTakeIx;
};

/**
 * Creates transaction instructions for opening a perp market order.
 * If swiftOptions is provided, it will create a Swift (signed message) order instead.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will place the order
 * @param assetType - Whether the amount is in base or quote units
 * @param marketIndex - The perp market index to trade
 * @param direction - The direction of the trade (long/short)
 * @param amount - The amount to trade
 * @param dlobServerHttpUrl - Server URL for the auction params endpoint
 * @param optionalAuctionParamsInputs - Optional parameters for auction params endpoint and order configuration
 * @param positionMaxLeverage - Optional per-market leverage (e.g., 5 for 5x). If provided and different from current,
 *                               adds an instruction to update the position's maxMarginRatio before placing the order.
 * @param userOrderId - the order ID in terms of incremental fills (usually 0). do NOT use the nextOrderId from the user account. values over 255 will cause the order to fail onchain.
 * @returns Promise resolving to an array of transaction instructions for regular orders
 */
export const createOpenPerpMarketOrderIxs = async ({
	velocityClient,
	user,
	assetType,
	marketIndex,
	direction,
	amount,
	reduceOnly,
	bracketOrders,
	dlobServerHttpUrl,
	placeAndTake,
	userOrderId,
	optionalAuctionParamsInputs = {},
	positionMaxLeverage,
	mainSignerOverride,
	marginMode,
	isolatedPositionDepositsOverride,
	callbacks,
	builderParams,
}: OpenPerpMarketOrderBaseParams): Promise<TransactionInstruction[]> => {
	if (!amount || amount.isZero()) {
		throw new Error('Amount must be greater than zero');
	}

	const resolvedDeposits = resolveIsolatedPositionDepositsWithOverride(
		isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: amount,
			direction,
			positionMaxLeverage,
			marginMode,
			replenishUnderwaterPositions: true,
		}
	);

	const mainIsolatedDeposit = resolvedDeposits?.mainDeposit;
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
				mainIsolatedDeposit,
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

	if (placeAndTake?.enable) {
		try {
			const placeAndTakeIx = await createPlaceAndTakePerpMarketOrderIx({
				assetType,
				amount,
				direction,
				dlobServerHttpUrl,
				marketIndex,
				velocityClient,
				user,
				userOrderId,
				reduceOnly,
				auctionDurationPercentage: placeAndTake.auctionDurationPercentage,
				takerEscrow: placeAndTake.takerEscrow,
				optionalAuctionParamsInputs,
				mainSignerOverride,
				positionMaxLeverage,
				builderParams,
			});
			allIxs.push(placeAndTakeIx);
		} catch (e) {
			if (e instanceof NoTopMakersError) {
				// fallback to regular order
				allOrders.push(e.orderParams);
			} else {
				throw e;
			}
		}
	} else {
		const { orderParams: fetchedOrderParams } = await fetchAuctionOrderParams({
			velocityClient,
			user,
			assetType,
			marketIndex,
			marketType: MarketType.PERP,
			direction,
			amount,
			dlobServerHttpUrl,
			optionalAuctionParamsInputs,
			reduceOnly,
			onAuctionParamsFetched: callbacks?.onAuctionParamsFetched,
		});

		const orderParams = {
			...fetchedOrderParams,
			userOrderId,
			...(builderParams ?? {}),
		};

		allOrders.push(orderParams);
	}

	const bracketOrdersDirection = ENUM_UTILS.match(
		direction,
		PositionDirection.LONG
	)
		? PositionDirection.SHORT
		: PositionDirection.LONG;

	if (bracketOrders?.takeProfit) {
		const takeProfitParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction: bracketOrdersDirection,
			baseAssetAmount: bracketOrders.takeProfit.baseAssetAmount ?? amount,
			orderConfig: {
				orderType: 'takeProfit',
				triggerPrice: bracketOrders.takeProfit.triggerPrice,
				limitPrice: bracketOrders.takeProfit.limitPrice,
			},
			reduceOnly: bracketOrders.takeProfit.reduceOnly ?? true,
		});
		allOrders.push(takeProfitParams);
	}

	if (bracketOrders?.stopLoss) {
		const stopLossParams = buildNonMarketOrderParams({
			marketIndex,
			marketType: MarketType.PERP,
			direction: bracketOrdersDirection,
			baseAssetAmount: bracketOrders.stopLoss.baseAssetAmount ?? amount,
			orderConfig: {
				orderType: 'stopLoss',
				triggerPrice: bracketOrders.stopLoss.triggerPrice,
				limitPrice: bracketOrders.stopLoss.limitPrice,
			},
			reduceOnly: bracketOrders.stopLoss.reduceOnly ?? true,
		});
		allOrders.push(stopLossParams);
	}

	// Regular order flow - create transaction instruction
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
 * Creates a complete transaction for opening a perp market order.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will place the order
 * @param marketIndex - The perp market index to trade
 * @param direction - The direction of the trade (long/short)
 * @param amount - The amount to trade
 * @param optionalAuctionParamsInputs - Optional parameters for auction params endpoint and order configuration
 * @param dlobServerHttpUrl - Server URL for the auction params endpoint
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
 * @param optionalAuctionParamsInputs - Optional parameters for auction params endpoint and order configuration
 * @param dlobServerHttpUrl - Server URL for the auction params endpoint
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

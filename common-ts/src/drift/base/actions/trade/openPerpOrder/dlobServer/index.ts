import {
	VelocityClient,
	User,
	BN,
	PositionDirection,
	OptionalOrderParams,
	MarketType,
	UserAccount,
	PublicKey,
	decodeUser,
	DefaultOrderParams,
	BASE_PRECISION,
	L2OrderBook,
	MMOraclePriceData,
	getVammL2Generator,
	createL2Levels,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../../../../../../utils';
import { calculateSpreadBidAskMark } from '../../../../../../utils/math';
import {
	mapAuctionParamsResponse,
	mapAuctionParamsResponseMeta,
	ServerAuctionParamsResponse,
	MappedAuctionParams,
	MappedPriceImpact,
	AuctionOrderParamsMeta,
	FetchAuctionOrderParamsResult,
	AuctionParamsFetchedCallback,
} from '../../../../../utils/auctionParamsResponseMapper';
import { encodeQueryParams } from '../../../../../../utils/core/fetch';
import { MarketId, TradeOffsetPrice } from '../../../../../../types';
import {
	convertToL2OrderBook,
	deserializeL2Response,
	calculateDynamicSlippageFromL2,
	DynamicSlippageConfig,
} from '../../../../../../utils/orderbook';
import {
	L2WithOracleAndMarketData,
	RawL2Output,
} from '../../../../../../utils/orderbook/types';
import { PollingSequenceGuard } from '../../../../../../utils/pollingSequenceGuard';
import { calculatePriceImpactFromL2 } from '../../../../../../utils/priceImpact';
import {
	getPriceObject,
	deriveMarketOrderParams,
} from '../../../../../../utils/trading/auction';
import invariant from 'tiny-invariant';
import { logger } from '../../../../../../utils/logger';

export interface OptionalAuctionParamsRequestInputs {
	// Optional parameters that can override defaults or provide additional configuration
	maxLeverageSelected?: boolean;
	maxLeverageOrderSize?: BN;
	auctionDuration?: number;
	auctionStartPriceOffset?: number;
	auctionEndPriceOffset?: number;
	auctionStartPriceOffsetFrom?: TradeOffsetPrice;
	auctionEndPriceOffsetFrom?: TradeOffsetPrice;
	slippageTolerance?: number | 'dynamic';
	isOracleOrder?: boolean;
	additionalEndPriceBuffer?: BN;
	forceUpToSlippage?: boolean;
	/**
	 * Auction params API version, forwarded to the dlob-server's /auctionParams endpoint as `version`
	 */
	version?: number;
}

interface RegularOrderParams {
	velocityClient: VelocityClient;
	user: User;
	assetType: 'base' | 'quote';
	marketType: MarketType;
	marketIndex: number;
	direction: PositionDirection;
	amount: BN;
	dlobServerHttpUrl: string;
	reduceOnly?: boolean;
	optionalAuctionParamsInputs?: OptionalAuctionParamsRequestInputs;
	dynamicSlippageConfig?: DynamicSlippageConfig;
	onAuctionParamsFetched?: AuctionParamsFetchedCallback;
	/**
	 * Skips the /auctionParams endpoint tier and derives params from L2 data directly.
	 * Wired from the UI's FORCE_ORDER_PARAMS_FALLBACK feature flag.
	 */
	forceFallback?: boolean;
}

export interface BulkL2FetchingQueryParams {
	marketIndex: number;
	marketType: string;
	depth: number;
	includeVamm: boolean;
	includeOracle: boolean;
	includeIndicative: boolean;
}

export interface BulkL2FetchingParams {
	markets: BulkL2FetchingQueryParams[];
	grouping?: number;
}

const BACKGROUND_L2_POLLING_KEY = Symbol('BACKGROUND_L2_POLLING_KEY');

/**
 * Fetches the L2 data for the given markets and their depth
 */
export function fetchBulkMarketsDlobL2Data(
	dlobServerHttpUrl: string,
	markets: {
		marketId: MarketId;
		depth: number;
	}[],
	groupingSize?: number,
	excludeIndicativeLiquidity = false
): Promise<L2WithOracleAndMarketData[]> {
	const params: BulkL2FetchingParams = {
		markets: markets.map((m) => ({
			marketIndex: m.marketId.marketIndex,
			marketType: m.marketId.marketTypeStr,
			depth: m.depth,
			includeVamm: m.marketId.isPerp,
			includeOracle: true,
			includeIndicative: !excludeIndicativeLiquidity,
		})),
		grouping: groupingSize,
	};

	const queryParamsMap: {
		[K in keyof BulkL2FetchingQueryParams]: string;
	} & {
		grouping?: string;
	} = {
		marketType: params.markets.map((market) => market.marketType).join(','),
		marketIndex: params.markets.map((market) => market.marketIndex).join(','),
		depth: params.markets.map((market) => market.depth).join(','),
		includeVamm: params.markets.map((market) => market.includeVamm).join(','),
		grouping: params.grouping
			? params.markets.map(() => params.grouping).join(',')
			: undefined,
		includeOracle: params.markets
			.map((market) => market.includeOracle)
			.join(','),
		includeIndicative: params.markets
			.map((market) => market.includeIndicative)
			.join(','),
	};

	const queryParams = encodeQueryParams(queryParamsMap);

	// Use cached endpoint when exclusively fetching background markets
	const useCachedEndpoint = !params.markets.some(
		(market) => market.depth !== 1
	);

	const endpoint = useCachedEndpoint
		? `${dlobServerHttpUrl}/batchL2Cache`
		: `${dlobServerHttpUrl}/batchL2`;

	return new Promise<L2WithOracleAndMarketData[]>((resolve, reject) => {
		PollingSequenceGuard.fetch(BACKGROUND_L2_POLLING_KEY, () => {
			return fetch(`${endpoint}?${queryParams}`);
		})
			.then(async (response) => {
				const responseData = await response.json();
				const resultsArray = responseData.l2s as RawL2Output[];
				const deserializedL2 = resultsArray.map(deserializeL2Response);
				resolve(deserializedL2);
			})
			.catch((error) => {
				reject(error);
			});
	});
}

export async function fetchAuctionOrderParams(
	params: RegularOrderParams
): Promise<FetchAuctionOrderParamsResult> {
	if (params.forceFallback) {
		return await fetchAuctionOrderParamsFromL2(params);
	}

	try {
		return await fetchAuctionOrderParamsFromDlob(params);
	} catch (error) {
		logger.error(error);
		logger.debug('Falling back to L2 data');
		return await fetchAuctionOrderParamsFromL2(params);
	}
}

const calcBaseFromQuote = (
	velocityClient: VelocityClient,
	marketIndex: number,
	amount: BN
) => {
	const oraclePrice =
		velocityClient.getOracleDataForPerpMarket(marketIndex).price;
	return amount.mul(BASE_PRECISION).div(oraclePrice);
};

/**
 * Fetches auction order parameters from the auction params endpoint
 */
export async function fetchAuctionOrderParamsFromDlob({
	marketIndex,
	marketType,
	direction,
	amount,
	dlobServerHttpUrl,
	assetType,
	velocityClient,
	reduceOnly,
	optionalAuctionParamsInputs = {},
	onAuctionParamsFetched,
}: RegularOrderParams): Promise<FetchAuctionOrderParamsResult> {
	const baseAmount =
		assetType === 'base'
			? amount
			: calcBaseFromQuote(velocityClient, marketIndex, amount);

	// Build URL parameters for server request
	const urlParamsObject: Record<string, string> = {
		// Required fields
		assetType: 'base',
		marketType: ENUM_UTILS.toStr(marketType),
		marketIndex: marketIndex.toString(),
		direction: ENUM_UTILS.toStr(direction),
		amount: baseAmount.toString(),
		reduceOnly: reduceOnly ? 'true' : 'false',
	};

	// Add defined optional parameters
	Object.entries(optionalAuctionParamsInputs).forEach(([key, value]) => {
		if (value !== undefined) {
			urlParamsObject[key] = value.toString();
		}
	});

	const urlParams = encodeQueryParams(urlParamsObject);

	// Get order params from server
	const requestUrl = `${dlobServerHttpUrl}/auctionParams?${urlParams.toString()}`;
	const response = await fetch(requestUrl);

	if (!response.ok) {
		throw new Error(
			`Server responded with ${response.status}: ${response.statusText}`
		);
	}

	const serverResponse: ServerAuctionParamsResponse = await response.json();
	const serverAuctionParams = serverResponse?.data?.params;
	invariant(serverAuctionParams, 'Server auction params are required');

	const mappedParams: MappedAuctionParams =
		mapAuctionParamsResponse(serverAuctionParams);

	// Convert MappedAuctionParams to OptionalOrderParams
	const orderParams: OptionalOrderParams = {
		orderType: mappedParams.orderType,
		marketType: mappedParams.marketType,
		userOrderId: mappedParams.userOrderId,
		direction: mappedParams.direction,
		baseAssetAmount: mappedParams.baseAssetAmount,
		marketIndex: mappedParams.marketIndex,
		reduceOnly: mappedParams.reduceOnly,
		postOnly: mappedParams.postOnly ?? DefaultOrderParams.postOnly,
		triggerPrice: mappedParams.triggerPrice || null,
		triggerCondition:
			mappedParams.triggerCondition ?? DefaultOrderParams.triggerCondition,
		oraclePriceOffset: mappedParams.oraclePriceOffset || null,
		auctionDuration: mappedParams.auctionDuration || null,
		maxTs: mappedParams.maxTs,
		auctionStartPrice: mappedParams.auctionStartPrice || null,
		auctionEndPrice: mappedParams.auctionEndPrice || null,
		// no price, because market orders don't need a price
	};

	const meta: AuctionOrderParamsMeta = {
		source: 'endpoint',
		...mapAuctionParamsResponseMeta(serverResponse.data),
	};

	const result: FetchAuctionOrderParamsResult = { orderParams, meta };

	onAuctionParamsFetched?.(
		new URLSearchParams(urlParamsObject),
		serverResponse,
		result
	);

	return result;
}

const DEFAULT_L2_DEPTH_FOR_AUCTION_ORDER_PARAMS = 100;

/**
 * Fetches auction order parameters from the L2 data
 */
export async function fetchAuctionOrderParamsFromL2({
	dlobServerHttpUrl,
	marketIndex,
	marketType,
	direction,
	assetType,
	amount,
	reduceOnly,
	optionalAuctionParamsInputs = {},
	velocityClient,
	dynamicSlippageConfig,
}: RegularOrderParams): Promise<FetchAuctionOrderParamsResult> {
	const marketId = new MarketId(marketIndex, marketType);
	const baseAmount =
		assetType === 'base'
			? amount
			: calcBaseFromQuote(velocityClient, marketIndex, amount);

	const l2DataResponse = await fetchBulkMarketsDlobL2Data(dlobServerHttpUrl, [
		{
			marketId,
			depth: DEFAULT_L2_DEPTH_FOR_AUCTION_ORDER_PARAMS,
		},
	]);
	const oraclePriceData = l2DataResponse[0].oracleData;
	const oraclePriceBn = oraclePriceData?.price;
	const markPriceBn = l2DataResponse[0].markPrice;
	const l2Data = convertToL2OrderBook(l2DataResponse);

	return deriveFromL2Inputs({
		l2Data,
		oraclePrice: oraclePriceBn,
		markPrice: markPriceBn,
		marketId,
		marketType,
		marketIndex,
		direction,
		baseAmount,
		reduceOnly,
		optionalAuctionParamsInputs,
		dynamicSlippageConfig,
		source: 'l2',
	});
}

/**
 * Derives auction order params from L2 data, oracle price, and mark price. Shared by
 * the network L2 tier (`fetchAuctionOrderParamsFromL2`) and the network-free vAMM
 * fallback tier so both code paths cannot drift from each other.
 */
export function deriveFromL2Inputs({
	l2Data,
	oraclePrice,
	markPrice,
	marketId,
	marketType,
	marketIndex,
	direction,
	baseAmount,
	reduceOnly,
	optionalAuctionParamsInputs,
	dynamicSlippageConfig,
	source,
}: {
	l2Data: L2OrderBook;
	oraclePrice: BN;
	markPrice: BN;
	marketId: MarketId;
	marketType: MarketType;
	marketIndex: number;
	direction: PositionDirection;
	baseAmount: BN;
	reduceOnly?: boolean;
	optionalAuctionParamsInputs: OptionalAuctionParamsRequestInputs;
	dynamicSlippageConfig?: DynamicSlippageConfig;
	source: AuctionOrderParamsMeta['source'];
}): FetchAuctionOrderParamsResult {
	const priceImpactData = calculatePriceImpactFromL2(
		marketId,
		direction,
		baseAmount,
		l2Data,
		oraclePrice
	);

	const startPrices = getPriceObject({
		oraclePrice,
		bestOffer: priceImpactData.bestPrice,
		entryPrice: priceImpactData.entryPrice,
		worstPrice: priceImpactData.worstPrice,
		markPrice,
		direction,
	});

	const slippageToleranceInput = optionalAuctionParamsInputs.slippageTolerance;
	const derivedSlippage =
		slippageToleranceInput === 'dynamic'
			? calculateDynamicSlippageFromL2({
					l2Data,
					marketId,
					startPrice:
						startPrices[
							optionalAuctionParamsInputs.auctionStartPriceOffsetFrom as keyof typeof startPrices
						],
					worstPrice: priceImpactData.worstPrice,
					oraclePrice,
					dynamicSlippageConfig,
			  })
			: typeof slippageToleranceInput === 'number'
			? slippageToleranceInput
			: 0.005;

	const auctionOrderParams = deriveMarketOrderParams({
		marketType,
		marketIndex,
		direction,
		maxLeverageSelected:
			optionalAuctionParamsInputs.maxLeverageSelected ?? false,
		maxLeverageOrderSize:
			optionalAuctionParamsInputs.maxLeverageOrderSize ?? new BN(0),
		baseAmount,
		reduceOnly: reduceOnly ?? false,
		allowInfSlippage: false,
		oraclePrice,
		bestPrice: priceImpactData.bestPrice,
		entryPrice: priceImpactData.entryPrice,
		worstPrice: priceImpactData.worstPrice,
		markPrice,
		auctionDuration: optionalAuctionParamsInputs.auctionDuration ?? 0,
		auctionStartPriceOffset:
			optionalAuctionParamsInputs.auctionStartPriceOffset ?? 0,
		auctionEndPriceOffset:
			optionalAuctionParamsInputs.auctionEndPriceOffset ?? 0,
		auctionStartPriceOffsetFrom:
			optionalAuctionParamsInputs.auctionStartPriceOffsetFrom ?? 'oracle',
		auctionEndPriceOffsetFrom:
			optionalAuctionParamsInputs.auctionEndPriceOffsetFrom ?? 'worst',
		slippageTolerance: derivedSlippage,
		isOracleOrder: optionalAuctionParamsInputs.isOracleOrder,
		additionalEndPriceBuffer:
			optionalAuctionParamsInputs.additionalEndPriceBuffer,
		forceUpToSlippage: optionalAuctionParamsInputs.forceUpToSlippage,
	});

	if (!auctionOrderParams) {
		throw new Error(`Failed to derive auction params from ${source}`);
	}

	const priceImpact: MappedPriceImpact = {
		entryPrice: priceImpactData.entryPrice,
		markPrice,
		oraclePrice,
		bestPrice: priceImpactData.bestPrice,
		worstPrice: priceImpactData.worstPrice,
		priceImpact: priceImpactData.priceImpact,
		baseAvailable: priceImpactData.baseAvailable,
		exceedsLiquidity: priceImpactData.exceedsLiquidity,
	};

	return {
		orderParams: auctionOrderParams,
		meta: { source, slippage: derivedSlippage, priceImpact },
	};
}

const VAMM_L2_NUM_ORDERS = DEFAULT_L2_DEPTH_FOR_AUCTION_ORDER_PARAMS; // 100

/**
 * Network-free last-resort tier: derives auction params from the in-memory perp AMM
 * + oracle when the DLOB server is unreachable. Used by FE-4472 fallback.
 */
export async function deriveAuctionParamsFromVamm({
	velocityClient,
	marketIndex,
	marketType,
	direction,
	assetType,
	amount,
	reduceOnly,
	optionalAuctionParamsInputs = {},
	dynamicSlippageConfig,
}: RegularOrderParams): Promise<FetchAuctionOrderParamsResult> {
	const marketId = new MarketId(marketIndex, marketType);
	const baseAmount =
		assetType === 'base'
			? amount
			: calcBaseFromQuote(velocityClient, marketIndex, amount);

	const marketAccount = velocityClient.getPerpMarketAccount(marketIndex);
	invariant(marketAccount, 'Perp market account not loaded on client');
	const mmOracle: MMOraclePriceData =
		velocityClient.getMMOracleDataForPerpMarket(marketIndex);
	const oraclePrice =
		velocityClient.getOracleDataForPerpMarket(marketIndex).price;

	const vammGen = getVammL2Generator({
		marketAccount,
		mmOraclePriceData: mmOracle,
		numOrders: VAMM_L2_NUM_ORDERS,
	});
	const l2Data: L2OrderBook = {
		bids: createL2Levels(vammGen.getL2Bids(), VAMM_L2_NUM_ORDERS),
		asks: createL2Levels(vammGen.getL2Asks(), VAMM_L2_NUM_ORDERS),
	};
	const markPrice = calculateSpreadBidAskMark(l2Data, oraclePrice)?.markPrice;

	logger.warn(
		'DLOB server unreachable — deriving auction params from on-chain vAMM'
	);

	return deriveFromL2Inputs({
		l2Data,
		oraclePrice,
		markPrice,
		marketId,
		marketType,
		marketIndex,
		direction,
		baseAmount,
		reduceOnly,
		optionalAuctionParamsInputs,
		dynamicSlippageConfig,
		source: 'vamm',
	});
}

type FetchTopMakersParams = {
	dlobServerHttpUrl: string;
	marketIndex: number;
	marketType: MarketType;
	side: 'bid' | 'ask';
	limit: number;
};

/**
 * Fetches the top makers information, for use as inputs in placeAndTake market orders.
 * The side of the request should be opposite of the side of the placeAndTake market order.
 */
export async function fetchTopMakers(params: FetchTopMakersParams): Promise<
	{
		userAccountPubKey: PublicKey;
		userAccount: UserAccount;
	}[]
> {
	try {
		const { dlobServerHttpUrl, marketIndex, marketType, side, limit } = params;

		const urlParams = encodeQueryParams({
			marketIndex: marketIndex.toString(),
			marketType: ENUM_UTILS.toStr(marketType),
			side,
			limit: limit.toString(),
			includeAccounts: 'true',
		});

		const requestUrl = `${dlobServerHttpUrl}/topMakers?${urlParams}`;
		const response = await fetch(requestUrl);

		if (!response.ok) {
			throw new Error(
				`Server responded with ${response.status}: ${response.statusText}`
			);
		}

		const serverResponse: {
			userAccountPubKey: string;
			accountBase64: string;
		}[] = await response.json();
		const mappedParams: {
			userAccountPubKey: PublicKey;
			userAccount: UserAccount;
		}[] = serverResponse.map((value) => ({
			userAccountPubKey: new PublicKey(value.userAccountPubKey),
			userAccount: decodeUser(Buffer.from(value.accountBase64, 'base64')),
		}));

		return mappedParams;
	} catch (e) {
		logger.error(e);
		return [];
	}
}

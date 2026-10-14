import {
	BN,
	OptionalOrderParams,
	OrderType,
	MarketType,
	PositionDirection,
} from '@velocity-exchange/sdk';
import { encodeQueryParams } from '../../../../../../utils/core/fetch';
import { MarketId } from '../../../../../../types';
import { deserializeL2Response } from '../../../../../../utils/orderbook';
import {
	L2WithOracleAndMarketData,
	RawL2Output,
} from '../../../../../../utils/orderbook/types';
import { PollingSequenceGuard } from '../../../../../../utils/pollingSequenceGuard';

/** What the slippage tolerance is measured from. `best` is the best price on the order's side. */
export type MarketOrderPriceReference = 'best' | 'mark' | 'oracle' | 'entry';

export interface MarketOrderQuoteInputs {
	/** Percent. Omit it and the server picks one that covers the book walk's worst price. */
	slippageTolerance?: number;
	priceReference?: MarketOrderPriceReference;
	/** Price the order as an offset from the oracle. The worst price is then `oraclePriceOffset`. */
	isOracleOrder?: boolean;
	maxLeverageSelected?: boolean;
	maxLeverageOrderSize?: BN;
}

export interface MarketOrderQuoteRequest {
	dlobServerHttpUrl: string;
	marketIndex: number;
	direction: PositionDirection;
	/** BASE_PRECISION for `assetType: 'base'`, QUOTE_PRECISION for `'quote'`. */
	amount: BN;
	assetType: 'base' | 'quote';
	reduceOnly?: boolean;
	userOrderId?: number;
	inputs?: MarketOrderQuoteInputs;
}

/** All prices are PRICE_PRECISION. */
export interface MarketOrderQuote {
	/** `price` is the worst price, and the server leaves `activationDelaySlots` at the book default. */
	orderParams: OptionalOrderParams;
	entryPrice: BN;
	bestPrice: BN;
	worstPrice: BN;
	oraclePrice: BN;
	markPrice: BN;
	/** A fraction, so 0.01 is one percent. */
	priceImpact: number;
	/** Percent. The tolerance the worst price was built from. */
	slippageTolerance: number;
	generatedAt: number;
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
const DLOB_REQUEST_TIMEOUT_MS = 3_000;

const fetchDlobWithTimeout = async <T>(
	url: string,
	handleResponse: (response: Response) => Promise<T>
): Promise<T> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		DLOB_REQUEST_TIMEOUT_MS
	);

	try {
		const response = await fetch(url, { signal: controller.signal });
		return await handleResponse(response);
	} finally {
		clearTimeout(timeoutId);
	}
};

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
			return fetchDlobWithTimeout(
				`${endpoint}?${queryParams}`,
				async (response) => {
					const responseData = await response.json();
					const resultsArray = responseData.l2s as RawL2Output[];
					return resultsArray.map(deserializeL2Response);
				}
			);
		})
			.then(resolve)
			.catch((error) => {
				reject(error);
			});
	});
}

/**
 * Quote a perp market order from the dlob-server. The quote is a worst price and the
 * book walk's estimates. There is no auction to derive, and no local fallback: the
 * published book already includes the vAMM.
 */
export async function fetchMarketOrderParams(
	request: MarketOrderQuoteRequest
): Promise<MarketOrderQuote> {
	const { inputs = {} } = request;
	const query = encodeQueryParams({
		marketIndex: request.marketIndex.toString(),
		direction: isLong(request.direction) ? 'long' : 'short',
		amount: request.amount.toString(),
		assetType: request.assetType,
		reduceOnly: request.reduceOnly ? 'true' : undefined,
		userOrderId: request.userOrderId?.toString(),
		slippageTolerance: inputs.slippageTolerance?.toString(),
		priceReference: inputs.priceReference,
		isOracleOrder: inputs.isOracleOrder ? 'true' : undefined,
		maxLeverageSelected: inputs.maxLeverageSelected ? 'true' : undefined,
		maxLeverageOrderSize: inputs.maxLeverageOrderSize?.toString(),
	});

	const body = await fetchDlobWithTimeout(
		`${request.dlobServerHttpUrl}/marketOrderParams?${query}`,
		async (response) => {
			if (!response.ok) {
				throw new Error(
					`marketOrderParams responded ${response.status}: ${await response.text()}`
				);
			}

			return (await response.json()).data;
		}
	);

	return deserializeMarketOrderQuote(body);
}

function isLong(direction: PositionDirection): boolean {
	return 'long' in direction;
}

const bnOrNull = (value: string | null | undefined) =>
	value === null || value === undefined ? null : new BN(value);

/** Parse the endpoint's `data` object. Its `params` use `OptionalOrderParams` names. */
export function deserializeMarketOrderQuote(data: any): MarketOrderQuote {
	const params = data.params;
	return {
		orderParams: {
			orderType:
				params.orderType === 'oracle' ? OrderType.ORACLE : OrderType.MARKET,
			marketType: MarketType.PERP,
			marketIndex: params.marketIndex,
			direction:
				params.direction === 'long'
					? PositionDirection.LONG
					: PositionDirection.SHORT,
			baseAssetAmount: new BN(params.baseAssetAmount),
			price: new BN(params.price),
			oraclePriceOffset: bnOrNull(params.oraclePriceOffset),
			reduceOnly: params.reduceOnly,
			userOrderId: params.userOrderId ?? undefined,
			activationDelaySlots: params.activationDelaySlots,
			maxTs: bnOrNull(params.maxTs),
		},
		entryPrice: new BN(data.entryPrice),
		bestPrice: new BN(data.bestPrice),
		worstPrice: new BN(data.worstPrice),
		oraclePrice: new BN(data.oraclePrice),
		markPrice: new BN(data.markPrice),
		priceImpact: data.priceImpact,
		slippageTolerance: data.slippageTolerance,
		generatedAt: data.generatedAt,
	};
}

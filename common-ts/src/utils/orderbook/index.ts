import {
	L2OrderBook,
	BN,
	BigNum,
	PERCENTAGE_PRECISION_EXP,
	PRICE_PRECISION_EXP,
	L2Level,
	ZERO,
	groupL2,
} from '@velocity-exchange/sdk';
import { MarketId } from '../../types';
import { calculateSpreadBidAskMark } from '../math';
import { logger } from '../logger';
import {
	BidsAndAsks,
	CategorisedLiquidity,
	CUMULATIVE_SIZE_CURRENCY,
	EmptyRow,
	GroupingSizeQuoteValue,
	L2WithOracleAndMarketData,
	LiquidityType,
	OrderBookBidAsk,
	OrderBookDisplayStateBidAsk,
	RawL2Output,
} from './types';
import { dividesExactly } from '../math';
import { EMPTY_ORDERBOOK_ROW } from './constants';

export * from './types';
export * from './constants';

/**
 * Helper function to deserialize the response from the dlob server. (See https://velocity-exchange.github.io/v2-teacher/#get-l2-l3)
 * @param serializedOrderbook
 * @returns
 */
export const deserializeL2Response = (
	serializedOrderbook: RawL2Output
): L2WithOracleAndMarketData => {
	return {
		asks: serializedOrderbook.asks.map((ask) => ({
			price: new BN(ask.price),
			size: new BN(ask.size),
			sources: Object.entries(ask.sources).reduce((previous, [key, val]) => {
				return {
					...previous,
					[key]: new BN(val),
				};
			}, {}),
		})),
		bids: serializedOrderbook.bids.map((bid) => ({
			price: new BN(bid.price),
			size: new BN(bid.size),
			sources: Object.entries(bid.sources).reduce((previous, [key, val]) => {
				return {
					...previous,
					[key]: new BN(val),
				};
			}, {}),
		})),
		oracleData: {
			price: serializedOrderbook.oracleData.price
				? new BN(serializedOrderbook.oracleData.price)
				: undefined,
			slot: serializedOrderbook.oracleData.slot
				? new BN(serializedOrderbook.oracleData.slot)
				: undefined,
			confidence: serializedOrderbook.oracleData.confidence
				? new BN(serializedOrderbook.oracleData.confidence)
				: undefined,
			hasSufficientNumberOfDataPoints:
				serializedOrderbook.oracleData.hasSufficientNumberOfDataPoints,
			twap: serializedOrderbook.oracleData.twap
				? new BN(serializedOrderbook.oracleData.twap)
				: undefined,
			twapConfidence: serializedOrderbook.oracleData.twapConfidence
				? new BN(serializedOrderbook.oracleData.twapConfidence)
				: undefined,
			maxPrice: serializedOrderbook.oracleData.maxPrice
				? new BN(serializedOrderbook.oracleData.maxPrice)
				: undefined,
		},
		mmOracleData: {
			price: serializedOrderbook.mmOracleData?.price
				? new BN(serializedOrderbook.mmOracleData.price)
				: undefined,
			slot: serializedOrderbook.mmOracleData?.slot
				? new BN(serializedOrderbook.mmOracleData.slot)
				: undefined,
			confidence: serializedOrderbook.mmOracleData?.confidence
				? new BN(serializedOrderbook.mmOracleData.confidence)
				: undefined,
			hasSufficientNumberOfDataPoints:
				serializedOrderbook.mmOracleData?.hasSufficientNumberOfDataPoints ??
				false,
			isMMOracleActive:
				serializedOrderbook.mmOracleData?.isMMOracleActive ?? false,
		},
		slot: serializedOrderbook.slot,
		marketSlot: serializedOrderbook.marketSlot,
		marketType: serializedOrderbook.marketType,
		marketIndex: serializedOrderbook.marketIndex,
		marketName: serializedOrderbook.marketName,
		markPrice: new BN(serializedOrderbook.markPrice),
		bestBidPrice: new BN(serializedOrderbook.bestBidPrice),
		bestAskPrice: new BN(serializedOrderbook.bestAskPrice),
		spreadPct: new BN(serializedOrderbook.spreadPct),
		spreadQuote: new BN(serializedOrderbook.spreadQuote),
	};
};

export const convertToL2OrderBook = (
	l2Data: L2WithOracleAndMarketData[]
): L2OrderBook => {
	// Find the market data - there should be one entry for our market
	const marketData = l2Data[0];

	if (!marketData) {
		throw new Error('No L2 data available for market');
	}

	// L2WithOracleAndMarketData extends L2OrderBook, so we can use it directly
	return {
		asks: marketData.asks,
		bids: marketData.bids,
		slot: marketData.slot,
	};
};

export interface DynamicSlippageConfig {
	dynamicSlippageMin?: number;
	dynamicSlippageMax?: number;
	dynamicBaseSlippageMajor?: number;
	dynamicBaseSlippageNonMajor?: number;
	dynamicSlippageMultiplierMajor?: number;
	dynamicSlippageMultiplierNonMajor?: number;
}

const DEFAULT_DYNAMIC_SLIPPAGE_CONFIG: DynamicSlippageConfig = {
	dynamicSlippageMin: 0.05,
	dynamicSlippageMax: 5,
	dynamicBaseSlippageMajor: 0,
	dynamicBaseSlippageNonMajor: 0.5,
	dynamicSlippageMultiplierMajor: 1.02,
	dynamicSlippageMultiplierNonMajor: 1.2,
};

export const calculateDynamicSlippageFromL2 = ({
	l2Data,
	marketId,
	startPrice,
	worstPrice,
	oraclePrice,
	dynamicSlippageConfig,
}: {
	l2Data: L2OrderBook;
	marketId: MarketId;
	startPrice: BN;
	worstPrice: BN;
	oraclePrice?: BN;
	dynamicSlippageConfig?: DynamicSlippageConfig;
}): number => {
	const dynamicSlippageConfigToUse = dynamicSlippageConfig
		? { ...DEFAULT_DYNAMIC_SLIPPAGE_CONFIG, ...dynamicSlippageConfig }
		: DEFAULT_DYNAMIC_SLIPPAGE_CONFIG;

	// Calculate spread information from L2 data using the oracle price
	const spreadBidAskMark = calculateSpreadBidAskMark(l2Data, oraclePrice);

	const bestAskNum = spreadBidAskMark.bestAskPrice?.toNumber?.() || 0;
	const bestBidNum = spreadBidAskMark.bestBidPrice?.toNumber?.() || 0;

	const spreadPctFromL2 = BigNum.from(
		spreadBidAskMark.spreadPct,
		PERCENTAGE_PRECISION_EXP
	).toNum();

	// Calculate spread percentage
	const spreadPct =
		spreadPctFromL2 ||
		(Math.abs(bestAskNum - bestBidNum) / ((bestAskNum + bestBidNum) / 2)) * 100;

	// Default to 0.5% if we get invalid spread info
	if (isNaN(spreadPct) || spreadPct <= 0) {
		return 0.5;
	}

	// Apply a buffer based on the tier of the contract
	// Currently no buffer for SOL/BTC/ETH perp and a +10% buffer for other markets
	const isMajor = marketId.isPerp && marketId.marketIndex < 3;

	const spreadBaseSlippage = spreadPct / 2;

	const baseSlippage = isMajor
		? dynamicSlippageConfigToUse.dynamicBaseSlippageMajor
		: dynamicSlippageConfigToUse.dynamicBaseSlippageNonMajor;
	let dynamicSlippage = (baseSlippage ?? 0) + spreadBaseSlippage;

	// Use halfway to worst price as size adjusted slippage
	if (startPrice && worstPrice) {
		const sizeAdjustedSlippage =
			(startPrice.sub(worstPrice).abs().toNumber() /
				BN.max(startPrice, worstPrice).toNumber() /
				2) *
			100;

		dynamicSlippage = Math.max(dynamicSlippage, sizeAdjustedSlippage);
	}

	// Apply multiplier from env var
	const multiplier = isMajor
		? dynamicSlippageConfigToUse.dynamicSlippageMultiplierMajor
		: dynamicSlippageConfigToUse.dynamicSlippageMultiplierNonMajor;

	dynamicSlippage = dynamicSlippage * (multiplier ?? 1);

	// Enforce .05% minimum, 5% maximum, can change these in env vars
	const finalSlippage = Math.min(
		Math.max(
			dynamicSlippage,
			dynamicSlippageConfigToUse.dynamicSlippageMin ?? 0
		),
		dynamicSlippageConfigToUse.dynamicSlippageMax ?? Infinity
	);

	// Round to avoid floating point precision issues, preserving 6 decimal places
	return Math.round(finalSlippage * 1000000) / 1000000;
};

export const getFormattedSize = (
	sizesObject: Partial<Record<LiquidityType, number>>,
	price: number,
	currency: CUMULATIVE_SIZE_CURRENCY,
	displayDecimals: number
) => {
	const sizeSum = Object.values(sizesObject || {}).reduce(
		(acc, curr) => acc + curr,
		0
	);

	const displayValue =
		currency === CUMULATIVE_SIZE_CURRENCY.USD && price
			? sizeSum * price
			: sizeSum;

	return BigNum.fromPrint(
		displayValue.toFixed(displayDecimals),
		new BN(displayDecimals)
	).toMillified(3);
};

export const getLiquidityPcts = (
	totalSize: number,
	cumulativeSize: CategorisedLiquidity = {}
) => {
	const totalCumulativeSize = Object.values(cumulativeSize).reduce(
		(acc, curr) => acc + curr,
		0
	);

	const cumulativeSizePct = totalSize
		? (totalCumulativeSize / totalSize) * 100
		: 0; // This is the portion of the total size of the orderbook that the cumulative size of the liquidity should be occupying.

	const cumulativeRestingSize =
		totalCumulativeSize - (cumulativeSize?.indicative ?? 0);
	const cumulativeIndicativeSize = cumulativeSize?.indicative ?? 0;

	const restingLiquidityPct =
		(cumulativeRestingSize / totalCumulativeSize) * cumulativeSizePct; // This is the portion of the width of the orderbook that the resting liquidity should be occupying

	const indicativeLiquidityPct =
		(cumulativeIndicativeSize / totalCumulativeSize) * cumulativeSizePct; // This is the portion of the width of the orderbook that the indicative liquidity should be occupying

	return {
		restingLiquidityPct,
		indicativeLiquidityPct,
	};
};

const roundForOrderbook = (num: number) => Number(num.toFixed(6));

export const getBucketFloorForPrice = (
	price: number,
	groupingSize: GroupingSizeQuoteValue
) => {
	const priceIsNegative = price < 0;

	const _groupingSize = groupingSize as unknown as number;

	if (dividesExactly(price, _groupingSize)) {
		return roundForOrderbook(price);
	}

	const amountToDeduct = priceIsNegative
		? _groupingSize - (Math.abs(price) % _groupingSize)
		: Math.abs(price) % _groupingSize;

	const floorPrice = price - amountToDeduct;

	return roundForOrderbook(floorPrice);
};

export const getUserLiquidityForPrice = ({
	price,
	side,
	groupingSizeValue,
	userAskPriceBucketLookup,
	userBidPriceBucketLookup,
}: {
	price: number;
	side: 'bid' | 'ask';
	groupingSizeValue: GroupingSizeQuoteValue;
	userAskPriceBucketLookup: Map<number, OrderBookBidAsk>;
	userBidPriceBucketLookup: Map<number, OrderBookBidAsk>;
}) => {
	let isCurrentUserLiquidity = false;
	let currentUserLiquiditySize = 0;

	const priceBucket = getBucketFloorForPrice(price, groupingSizeValue);

	const lookupBucket =
		side === 'bid' ? userBidPriceBucketLookup : userAskPriceBucketLookup;

	const matchingUserBidAsk = lookupBucket.get(priceBucket);

	if (matchingUserBidAsk) {
		isCurrentUserLiquidity = true;
		currentUserLiquiditySize = matchingUserBidAsk.size;
	}

	return { isCurrentUserLiquidity, currentUserLiquiditySize };
};

const getBucketCeilingForPrice = (
	price: number,
	groupingSize: GroupingSizeQuoteValue
) => {
	const _groupingSize = groupingSize as unknown as number;
	return getBucketFloorForPrice(price + _groupingSize, groupingSize);
};

export const getBucketAnchorPrice = (
	type: 'bid' | 'ask',
	price: number,
	groupingSize: GroupingSizeQuoteValue
) => {
	// If the grouping size matches exactly then the anchor price should be the same as the floor price regardless
	if (dividesExactly(price, groupingSize as unknown as number)) {
		return getBucketFloorForPrice(price, groupingSize);
	}

	if (type === 'bid') {
		return getBucketFloorForPrice(price, groupingSize);
	} else {
		return getBucketCeilingForPrice(price, groupingSize);
	}
};

export const getBucketForUserLiquidity = (
	price: number,
	groupingSize: GroupingSizeQuoteValue,
	type: 'bid' | 'ask'
) => getBucketAnchorPrice(type, price, groupingSize);

export const mergeBidsAndAsksForGroupsize = (
	type: 'bid' | 'ask',
	bidsAsks: OrderBookBidAsk[],
	groupingSize: GroupingSizeQuoteValue
): OrderBookBidAsk[] => {
	const bidsAsksBucketLookup = new Map<number, OrderBookBidAsk>();

	for (const bidAsk of bidsAsks) {
		const anchorPrice = getBucketAnchorPrice(type, bidAsk.price, groupingSize);
		const existingBucket = bidsAsksBucketLookup.get(anchorPrice);
		if (existingBucket) {
			existingBucket.size += bidAsk.size;
		} else {
			bidsAsksBucketLookup.set(anchorPrice, { ...bidAsk });
		}
	}

	return Array.from(bidsAsksBucketLookup.values());
};

export const getZeroPaddingForGroupingSize = (
	groupingSize: GroupingSizeQuoteValue
) => {
	const _groupingSize = groupingSize as unknown as number;

	const precision = Math.floor(Math.log10(_groupingSize));

	if (precision >= 0 || _groupingSize === 0) return 0;

	return Math.abs(precision);
};

const sizeToNum = (size: BN, precision: BN) =>
	BigNum.from(size, precision).toNum();

export const getCategorisedLiquidityForLevel = (
	level: L2Level,
	basePrecision: BN
): CategorisedLiquidity => {
	const dlobSize = sizeToNum(level?.sources?.dlob ?? ZERO, basePrecision);
	const vammSize = sizeToNum(level?.sources?.vamm ?? ZERO, basePrecision);
	const indicativeSize = sizeToNum(
		level?.sources?.indicative ?? ZERO,
		basePrecision
	);

	const categorisedLiquidity: CategorisedLiquidity = {
		dlob: dlobSize,
		vamm: vammSize,
		indicative: indicativeSize,
	};

	return categorisedLiquidity;
};

const formatLevelsToDisplay = (
	levels: L2Level[],
	basePrecision: BN,
	depth?: number
): {
	formattedLevels: OrderBookDisplayStateBidAsk[];
	bestLevel: number;
	cumulativeSize: number;
} => {
	const relevantSources: Set<LiquidityType> = new Set();

	for (const level of levels) {
		for (const source of Object.keys(level.sources)) {
			relevantSources.add(source as LiquidityType);
		}
	}

	const cumulativeSizes: CategorisedLiquidity = Array.from(
		relevantSources
	).reduce((acc, source) => {
		acc[source] = 0;
		return acc;
	}, {} as CategorisedLiquidity);

	let cumulativePriceSizeProduct = 0;
	let cumulativeTotalSize = 0;

	const formattedLevels: OrderBookDisplayStateBidAsk[] = levels.map((level) => {
		const bucketSize = getCategorisedLiquidityForLevel(level, basePrecision);
		const price = BigNum.from(level.price, PRICE_PRECISION_EXP).toNum();
		const totalSize = Object.values(bucketSize).reduce(
			(sum, size) => sum + size,
			0
		);

		for (const source of relevantSources) {
			const currentValue = cumulativeSizes[source];
			if (currentValue !== undefined) {
				cumulativeSizes[source] = currentValue + (bucketSize[source] ?? 0);
			}
		}

		cumulativePriceSizeProduct += price * totalSize;
		cumulativeTotalSize += totalSize;

		return {
			price,
			size: bucketSize,
			cumulativeSize: { ...cumulativeSizes },
			cumulativeAvgPrice:
				cumulativeTotalSize > 0
					? cumulativePriceSizeProduct / cumulativeTotalSize
					: 0,
		};
	});

	if (depth && depth > 0) {
		const visibleLevels = formattedLevels.slice(0, depth);
		const maxCumulativeSize = Math.max(
			0,
			...visibleLevels.map((level) =>
				Object.values(level.cumulativeSize).reduce((sum, size) => sum + size, 0)
			)
		);

		return {
			formattedLevels: visibleLevels,
			bestLevel: visibleLevels?.[0]?.price,
			cumulativeSize: maxCumulativeSize,
		};
	}

	const totalSizeToReturn = Object.values(cumulativeSizes).reduce(
		(total, current) => total + current,
		0
	);

	return {
		formattedLevels,
		bestLevel: formattedLevels?.[0]?.price,
		cumulativeSize: totalSizeToReturn,
	};
};

export const formatL2ToDisplay = (
	l2State: L2OrderBook,
	basePrecision: BN,
	depth?: number
) => {
	const formattedBids = formatLevelsToDisplay(
		l2State.bids,
		basePrecision,
		depth
	);
	const formattedAsks = formatLevelsToDisplay(
		l2State.asks,
		basePrecision,
		depth
	);

	return {
		bids: formattedBids.formattedLevels,
		asks: formattedAsks.formattedLevels,
		bidTotalSize: formattedBids.cumulativeSize,
		askTotalSize: formattedAsks.cumulativeSize,
	};
};

const filterOutDisabledLiquidityTypes = (
	l2Levels: L2Level[],
	disabledLiquidityTypes: LiquidityType[]
) =>
	l2Levels
		.map((level) => {
			let totalDisabledSize = ZERO;
			const disabledSourceObj: Record<LiquidityType, BN> = {} as Record<
				LiquidityType,
				BN
			>;

			for (const liquidityType of disabledLiquidityTypes) {
				const disabledLiqSize = level.sources?.[liquidityType];
				if (disabledLiqSize?.gt(ZERO)) {
					totalDisabledSize = totalDisabledSize.add(disabledLiqSize);
					disabledSourceObj[liquidityType] = ZERO;
				}
			}

			return totalDisabledSize.gt(ZERO)
				? {
						...level,
						size: level.size.sub(totalDisabledSize),
						sources: {
							...level.sources,
							...disabledSourceObj,
						},
				  }
				: level;
		})
		.filter((level) => level.size.gt(ZERO));

export const l2ToDisplayBidsAndAsks = (
	l2Orderbook: L2OrderBook,
	oraclePrice: BN,
	tickSizeForMarket: BN,
	groupSizeTickMultiplier: number,
	userBidsAndAsks: BidsAndAsks,
	basePrecisionForMarket: BN,
	disabledLiquidityTypes: LiquidityType[],
	maxDepth: number,
	depth?: number // limit the number of visible rows to calculate totalSize from
) => {
	const filteredBids =
		disabledLiquidityTypes.length > 0
			? filterOutDisabledLiquidityTypes(
					l2Orderbook.bids,
					disabledLiquidityTypes
			  )
			: l2Orderbook.bids;

	const filteredAsks =
		disabledLiquidityTypes.length > 0
			? filterOutDisabledLiquidityTypes(
					l2Orderbook.asks,
					disabledLiquidityTypes
			  )
			: l2Orderbook.asks;

	// # Uncross the liquidity
	const uncrossed = {
		l2Orderbook,
		bids: filteredBids,
		asks: filteredAsks,
	};

	// Group the orderbook into levels based on the grouping size
	const grouped = groupL2(
		uncrossed,
		tickSizeForMarket.muln(groupSizeTickMultiplier ?? 1), // one user had a weird error where .muln was throwing assertion failed error
		maxDepth
	);

	// # Convert to UI format
	const formatted = formatL2ToDisplay(grouped, basePrecisionForMarket, depth);

	// Check that bids are in descending order
	if (
		formatted.bids.some((bid, index) => {
			if (index === 0) return false;

			return bid.price > formatted.bids[index - 1].price;
		})
	) {
		logger.debug('orderbook - bids_not_in_descending_order', {
			l2Orderbook,
			oraclePrice,
			tickSizeForMarket,
			userBidsAndAsks,
			basePrecisionForMarket,
			uncrossed,
			formatted,
		});
	}

	// Check that asks are in ascending order
	if (
		formatted.asks.some((ask, index) => {
			if (index === 0) return false;

			return ask.price < formatted.asks[index - 1].price;
		})
	) {
		logger.debug('orderbook - asks_not_in_ascending_order', {
			l2Orderbook,
			oraclePrice,
			tickSizeForMarket,
			userBidsAndAsks,
			basePrecisionForMarket,
			uncrossed,
			formatted,
		});
	}

	return formatted;
};

export const getEmptyFilledBidsAsks = (
	bidsOrAsks: OrderBookDisplayStateBidAsk[],
	depth: number
): (OrderBookDisplayStateBidAsk | EmptyRow)[] => {
	const result = Array(depth).fill(EMPTY_ORDERBOOK_ROW);

	bidsOrAsks.forEach((bidOrAsk, index) => {
		if (index < depth) {
			result[index] = bidOrAsk;
		}
	});

	return result;
};

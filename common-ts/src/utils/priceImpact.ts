import {
	BN,
	ZERO,
	L2OrderBook,
	PositionDirection,
	BASE_PRECISION,
	calculateEstimatedEntryPriceWithL2,
	BASE_PRECISION_EXP,
} from '@velocity-exchange/sdk';
import { UIMarket } from '../types/UIMarket';
import { MarketId } from '../types/MarketId';
import { ENUM_UTILS } from '.';
import { logger } from './logger';

/**
 * Calculates the price impact of an order, based on an L2
 */
export const calculatePriceImpactFromL2 = (
	marketId: MarketId,
	direction: PositionDirection,
	baseAmount: BN,
	l2Data: L2OrderBook,
	_oraclePrice?: BN
): {
	entryPrice: BN;
	priceImpact: BN;
	baseAvailable: BN;
	bestPrice: BN;
	worstPrice: BN;
	exceedsLiquidity: boolean;
	showPriceEstimateOracleDivergenceWarning: boolean;
} => {
	let [entryPrice, priceImpact, baseFilled, bestPrice, worstPrice] = [
		ZERO,
		ZERO,
		ZERO,
		ZERO,
		ZERO,
	];
	let exceedsLiquidity = false;

	try {
		if (marketId.isPerp) {
			const entryResult = calculateEstimatedEntryPriceWithL2(
				'base', // leadSide
				baseAmount,
				direction,
				BASE_PRECISION,
				l2Data
			);

			entryPrice = entryResult?.entryPrice || ZERO;
			priceImpact = entryResult?.priceImpact || ZERO;
			baseFilled = entryResult?.baseFilled || ZERO;
			bestPrice = entryResult?.bestPrice || ZERO;
			worstPrice = entryResult?.worstPrice || ZERO;
		} else {
			const precisionExp =
				UIMarket.spotMarkets[marketId.marketIndex]?.precisionExp ||
				BASE_PRECISION_EXP;

			const entryResult = calculateEstimatedEntryPriceWithL2(
				'base', // leadSide
				baseAmount,
				direction,
				precisionExp,
				l2Data
			);

			entryPrice = entryResult?.entryPrice || ZERO;
			priceImpact = entryResult?.priceImpact || ZERO;
			baseFilled = entryResult?.baseFilled || ZERO;
			bestPrice = entryResult?.bestPrice || ZERO;
			worstPrice = entryResult?.worstPrice || ZERO;
		}

		// Check if we exceeded available liquidity
		if (baseFilled.lt(baseAmount)) {
			exceedsLiquidity = true;
		}
	} catch (e) {
		// SDK function may throw error if no liquidity, use fallback values
		logger.warn('Error calculating price impact from L2:', e);

		// Use best bid/ask as fallback
		const bestBid = l2Data.bids?.[0];
		const bestAsk = l2Data.asks?.[0];

		if (bestBid && bestAsk) {
			const isLong = ENUM_UTILS.match(direction, PositionDirection.LONG);
			entryPrice = isLong ? bestAsk.price : bestBid.price;
			bestPrice = isLong ? bestAsk.price : bestBid.price;
			worstPrice = isLong ? bestAsk.price : bestBid.price;
			baseFilled = isLong ? bestAsk.size : bestBid.size;
		}
	}

	return {
		entryPrice,
		priceImpact,
		baseAvailable: baseFilled,
		bestPrice,
		worstPrice,
		exceedsLiquidity,
		showPriceEstimateOracleDivergenceWarning: false, // Will be calculated by the caller
	};
};

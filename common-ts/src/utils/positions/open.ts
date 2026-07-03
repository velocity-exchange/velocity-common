import {
	BASE_PRECISION_EXP,
	BN,
	BigNum,
	VelocityClient,
	PRICE_PRECISION_EXP,
	PerpMarketConfig,
	PerpPosition,
	PositionDirection,
	QUOTE_PRECISION_EXP,
	QUOTE_SPOT_MARKET_INDEX,
	User,
	ZERO,
	calculateClaimablePnl,
	calculateCostBasis,
	calculateEntryPrice,
	calculateFeesAndFundingPnl,
	calculatePositionPNL,
	calculateUnsettledFundingPnl,
	isOracleValid,
	AMM_RESERVE_PRECISION,
} from '@velocity-exchange/sdk';
import { OpenPosition } from '../../types';
import { calculatePotentialProfit } from '../trading/pnl';

const getOpenPositionData = (
	velocityClient: VelocityClient,
	userPositions: PerpPosition[],
	user: User,
	perpMarketLookup: PerpMarketConfig[],
	markPriceCallback?: (marketIndex: number) => BN
): OpenPosition[] => {
	const oracleGuardRails = velocityClient.getStateAccount().oracleGuardRails;

	const newResult: OpenPosition[] = userPositions
		.filter(
			(position) =>
				!position.baseAssetAmount.eq(ZERO) ||
				!position.quoteAssetAmount.eq(ZERO)
		)
		.map((position) => {
			const perpMarketConfig = perpMarketLookup[position.marketIndex];
			const perpMarket = velocityClient.getPerpMarketAccountOrThrow(
				position.marketIndex
			);

			const usdtSpotMarket = velocityClient.getSpotMarketAccountOrThrow(
				QUOTE_SPOT_MARKET_INDEX
			);

			const oraclePriceData = velocityClient.getOracleDataForPerpMarket(
				position.marketIndex
			);

			let oraclePrice = oraclePriceData.price;

			// mark price fetched with a callback so we don't need extra dlob server calls. fallback to oracle
			let markPrice = markPriceCallback
				? markPriceCallback(position.marketIndex) ?? oraclePriceData.price
				: oraclePriceData.price;

			const estExitPrice = user.getPositionEstimatedExitPriceAndPnl(
				position,
				position.baseAssetAmount
			)[0];

			const entryPrice = calculateEntryPrice(position);

			const isShort = position.baseAssetAmount.isNeg();

			// if for any reason oracle or mark price blips to 0, fallback to the other one so we don't show a crazy pnl
			if (markPrice.lte(ZERO) && oraclePrice.gt(ZERO)) {
				markPrice = oraclePrice;
			}

			if (oraclePrice.lte(ZERO) && markPrice.gt(ZERO)) {
				oraclePrice = markPrice;
			}

			const pnlVsMark = calculatePotentialProfit({
				currentPositionSize: BigNum.from(
					position.baseAssetAmount.abs(),
					BASE_PRECISION_EXP
				),
				currentPositionDirection: isShort
					? PositionDirection.SHORT
					: PositionDirection.LONG,
				currentPositionEntryPrice: BigNum.from(entryPrice, PRICE_PRECISION_EXP),
				tradeDirection: isShort
					? PositionDirection.LONG
					: PositionDirection.SHORT,
				exitBaseSize: BigNum.from(
					position.baseAssetAmount.abs(),
					BASE_PRECISION_EXP
				),
				exitPrice: BigNum.from(markPrice, PRICE_PRECISION_EXP),
				takerFeeBps: 0,
			}).estimatedProfit.shiftTo(QUOTE_PRECISION_EXP).val;

			const pnlVsOracle = calculatePotentialProfit({
				currentPositionSize: BigNum.from(
					position.baseAssetAmount.abs(),
					BASE_PRECISION_EXP
				),
				currentPositionDirection: isShort
					? PositionDirection.SHORT
					: PositionDirection.LONG,
				currentPositionEntryPrice: BigNum.from(entryPrice, PRICE_PRECISION_EXP),
				tradeDirection: isShort
					? PositionDirection.LONG
					: PositionDirection.SHORT,
				exitBaseSize: BigNum.from(
					position.baseAssetAmount.abs(),
					BASE_PRECISION_EXP
				),
				exitPrice: BigNum.from(oraclePrice, PRICE_PRECISION_EXP),
				takerFeeBps: 0,
			}).estimatedProfit.shiftTo(QUOTE_PRECISION_EXP).val;

			return {
				marketIndex: position.marketIndex,
				marketSymbol: perpMarketConfig.symbol,
				direction: isShort ? 'short' : 'long',
				notional: position.baseAssetAmount
					.abs()
					.mul(markPrice)
					.div(AMM_RESERVE_PRECISION),
				baseSize: position.baseAssetAmount,
				markPrice,
				entryPrice,
				exitPrice: estExitPrice,
				liqPrice: user.isPerpPositionIsolated(position)
					? user.liquidationPrice(
							position.marketIndex,
							ZERO,
							undefined,
							undefined,
							undefined,
							undefined,
							'Isolated'
					  )
					: user.liquidationPrice(position.marketIndex, ZERO),
				quoteAssetNotionalAmount: position.quoteAssetAmount,
				quoteEntryAmount: position.quoteEntryAmount,
				quoteBreakEvenAmount: position.quoteBreakEvenAmount,
				pnlVsMark,
				pnlVsOracle,
				unsettledPnl: calculateClaimablePnl(
					perpMarket,
					usdtSpotMarket,
					position,
					oraclePriceData
				),
				unsettledFundingPnl: calculateUnsettledFundingPnl(perpMarket, position),
				// Includes both settled and unsettled funding as well as fees
				feesAndFundingPnl: calculateFeesAndFundingPnl(perpMarket, position),
				totalUnrealizedPnl: calculatePositionPNL(
					perpMarket,
					position,
					true,
					oraclePriceData
				),
				unrealizedFundingPnl: user.getUnrealizedFundingPNL(
					position.marketIndex
				),
				lastCumulativeFundingRate: position.lastCumulativeFundingRate,
				openOrders: position.openOrders,
				costBasis: calculateCostBasis(position),
				realizedPnl: position.settledPnl,
				pnlIsClaimable: isOracleValid(
					perpMarket,
					oraclePriceData,
					oracleGuardRails,
					perpMarket.amm.lastUpdateSlot?.toNumber()
				),
				maxMarginRatio: position.maxMarginRatio,
			};
		});

	return newResult;
};

export { getOpenPositionData };

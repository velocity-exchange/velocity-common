import {
	BASE_PRECISION_EXP,
	BN,
	BigNum,
	VelocityClient,
	PRICE_PRECISION_EXP,
	PerpPosition,
	PositionDirection,
	QUOTE_PRECISION_EXP,
	User,
	ZERO,
	calculateClaimablePnl,
	calculateEntryPrice,
	calculateFeesAndFundingPnl,
	calculatePositionPNL,
	calculateUnsettledFundingPnl,
} from '@velocity-exchange/sdk';
import { calculatePotentialProfit } from '../../../../utils/trading/pnl';
import { USDT_SPOT_MARKET_INDEX } from '../../../../constants';

/**
 * Comprehensive position information derived from a PerpPosition at a specific reference price.
 * This interface contains all the key metrics needed for position display and analysis.
 */
export interface PriceBasedPositionInfo {
	/**
	 * Position PnL in notional terms based on the reference price.
	 * This does NOT include funding PnL - only the price-based profit/loss.
	 */
	positionNotionalPnl: BigNum;

	/**
	 * Position PnL as a percentage.
	 * Calculated as (PnL / quote entry amount) * account leverage.
	 */
	positionPnlPercentage: number;
}

/**
 * Derives the user-understandable position display information from a User's PerpPosition and the reference price.
 * The reference price can be the mark price or the oracle price.
 *
 * @param velocityClient - The VelocityClient instance.
 * @param user - The User instance.
 * @param perpPosition - The PerpPosition instance.
 * @param referencePrice - The reference price. This can be the mark price or the oracle price.
 * @param accountLeverage - The account leverage.
 *
 * @returns The PositionDisplayInfo object. Note that position pnl does not include funding pnl.
 */
export const getPriceBasedPositionInfo = (
	velocityClient: VelocityClient,
	perpPosition: PerpPosition,
	referencePrice: BN,
	accountLeverage?: number
): PriceBasedPositionInfo => {
	const referencePriceBigNum = BigNum.from(referencePrice, PRICE_PRECISION_EXP);

	// Base Size
	const baseSize = perpPosition.baseAssetAmount;
	const baseSizeBigNum = BigNum.from(baseSize.abs(), BASE_PRECISION_EXP);

	// Entry Price
	const entryPriceBN = calculateEntryPrice(perpPosition);

	const isShortPosition = baseSize.isNeg();

	// Price calculations

	// position pnl
	const positionNotionalPnlBN = calculatePotentialProfit({
		currentPositionSize: baseSizeBigNum,
		currentPositionDirection: isShortPosition
			? PositionDirection.SHORT
			: PositionDirection.LONG,
		currentPositionEntryPrice: BigNum.from(entryPriceBN, PRICE_PRECISION_EXP),
		tradeDirection: isShortPosition
			? PositionDirection.LONG
			: PositionDirection.SHORT,
		exitBaseSize: baseSizeBigNum,
		exitPrice: referencePriceBigNum,
		takerFeeBps: 0,
	}).estimatedProfit.shiftTo(QUOTE_PRECISION_EXP).val;
	const positionNotionalPnlBigNum = BigNum.from(
		positionNotionalPnlBN,
		QUOTE_PRECISION_EXP
	);

	const positionPnlPercentage = accountLeverage
		? (() => {
				const quoteAmount = perpPosition.quoteEntryAmount.abs();

				if (quoteAmount.eq(ZERO)) return 0;

				const pnlPct =
					positionNotionalPnlBigNum.val
						.mul(new BN(10_000))
						.div(quoteAmount)
						.toNumber() / 1_000_000;
				return pnlPct * (accountLeverage || 1);
		  })()
		: 0;

	return {
		positionNotionalPnl: positionNotionalPnlBigNum,
		positionPnlPercentage,
	};
};

export type PerpPositionInfo = {
	marketIndex: number;
	/** Absolute base size of the position. */
	baseSize: BigNum;
	/** Notional value of the position based on oracle price */
	notionalSize: BigNum;
	/** Direction of the position */
	direction: PositionDirection;
	/** Position entry price.*/
	entryPrice: BigNum;
	/**
	 * Price at which the position would be liquidated.
	 * Returns zero if liquidation price cannot be calculated.
	 */
	liquidationPrice: BigNum;
	/**
	 * Cumulative funding and fees PnL for this position.
	 * This is separate from positionNotionalPnl to allow granular PnL breakdown.
	 */
	feesAndFundingPnl: BigNum;
	/** Position P&L information based on the oracle price and the mark price as reference prices. This does not include fees and funding PnL. */
	positionPnl: {
		oracleBased: PriceBasedPositionInfo;
		markBased: PriceBasedPositionInfo;
	};
	/** The quote amount that was used to enter the position. */
	costBasis: BigNum;
	/** The quote amount that the position needs to be at, to breakeven. This is net of fees and funding, hence why it is different from quoteEntryAmount. */
	quoteBreakEvenAmount: BigNum;
	/** This is the total of unsettled pnl and unsettled funding. */
	totalUnsettledPnl: BigNum;
	/** This is the total of unsettled pnl and unsettled funding that is claimable from the P&L pool. */
	totalClaimablePnl: BigNum;
	/** This is the unsettled funding pnl. */
	unsettledFundingPnl: BigNum;
	/** This is the total of settled pnl and settled funding. */
	totalSettledPnl: BigNum;
};

export const getPositionInfo = (
	velocityClient: VelocityClient,
	user: User,
	perpPosition: PerpPosition,
	oraclePrice: BN,
	markPrice: BN
): PerpPositionInfo => {
	const { marketIndex } = perpPosition;

	const baseSize = perpPosition.baseAssetAmount;
	const baseSizeBigNum = BigNum.from(baseSize.abs(), BASE_PRECISION_EXP);

	const notionalSizeBigNum = BigNum.from(
		user
			.getPerpPositionValue(perpPosition.marketIndex, {
				price: oraclePrice,
			})
			.abs(),
		QUOTE_PRECISION_EXP
	);

	const positionDirection = baseSize.isNeg()
		? PositionDirection.SHORT
		: PositionDirection.LONG;

	const entryPrice = calculateEntryPrice(perpPosition);
	const entryPriceBigNum = BigNum.from(entryPrice, PRICE_PRECISION_EXP);

	const liqPrice = user.liquidationPrice(marketIndex);
	const liqPriceBigNum = BigNum.from(liqPrice, PRICE_PRECISION_EXP);

	const perpMarket = velocityClient.getPerpMarketAccountOrThrow(marketIndex);
	const feesAndFundingPnlBigNum = BigNum.from(
		calculateFeesAndFundingPnl(perpMarket, perpPosition),
		QUOTE_PRECISION_EXP
	);

	const accountLeverage = user.getLeverage().toNumber();
	const oracleBasedPositionInfo = getPriceBasedPositionInfo(
		velocityClient,
		perpPosition,
		oraclePrice,
		accountLeverage
	);
	const markBasedPositionInfo = getPriceBasedPositionInfo(
		velocityClient,
		perpPosition,
		markPrice,
		accountLeverage
	);

	const quoteEntryAmountBigNum = BigNum.from(
		perpPosition.quoteEntryAmount,
		QUOTE_PRECISION_EXP
	);
	const quoteBreakEvenAmountBigNum = BigNum.from(
		perpPosition.quoteBreakEvenAmount,
		QUOTE_PRECISION_EXP
	);

	const totalUnrealizedPnlBigNum = BigNum.from(
		calculatePositionPNL(perpMarket, perpPosition, true, {
			price: oraclePrice,
		}),
		QUOTE_PRECISION_EXP
	);
	const usdtSpotMarketAccount = velocityClient.getSpotMarketAccountOrThrow(
		USDT_SPOT_MARKET_INDEX
	);
	const totalClaimablePnlBigNum = BigNum.from(
		calculateClaimablePnl(perpMarket, usdtSpotMarketAccount, perpPosition, {
			price: oraclePrice,
		}),
		QUOTE_PRECISION_EXP
	);
	const unsettledFundingPnlBigNum = BigNum.from(
		calculateUnsettledFundingPnl(perpMarket, perpPosition),
		QUOTE_PRECISION_EXP
	);
	const totalSettledPnlBigNum = BigNum.from(
		perpPosition.settledPnl,
		QUOTE_PRECISION_EXP
	);

	return {
		marketIndex,
		baseSize: baseSizeBigNum,
		notionalSize: notionalSizeBigNum,
		direction: positionDirection,
		entryPrice: entryPriceBigNum,
		liquidationPrice: liqPriceBigNum,
		feesAndFundingPnl: feesAndFundingPnlBigNum,
		positionPnl: {
			oracleBased: oracleBasedPositionInfo,
			markBased: markBasedPositionInfo,
		},
		costBasis: quoteEntryAmountBigNum,
		quoteBreakEvenAmount: quoteBreakEvenAmountBigNum,
		unsettledFundingPnl: unsettledFundingPnlBigNum,
		totalUnsettledPnl: totalUnrealizedPnlBigNum,
		totalClaimablePnl: totalClaimablePnlBigNum,
		totalSettledPnl: totalSettledPnlBigNum,
	};
};

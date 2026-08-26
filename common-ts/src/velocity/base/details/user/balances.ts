import {
	BigNum,
	BN,
	VelocityClient,
	MarketType,
	PRICE_PRECISION_EXP,
	QUOTE_PRECISION_EXP,
	User,
} from '@velocity-exchange/sdk';
import { getMarketConfig } from '../../../../utils/markets/config';

/**
 * Essential balance information for a spot market position.
 * Contains the three key metrics needed for balance display and analysis.
 */
export interface SpotBalanceInfo {
	marketIndex: number;
	/**
	 * Net balance in base asset terms (deposits - borrows).
	 * Positive values indicate net deposits, negative values indicate net borrows.
	 */
	baseBalance: BigNum;

	/**
	 * USD notional value of the net balance based on oracle price.
	 * This represents the current market value of the position.
	 */
	notionalBalance: BigNum;

	/**
	 * Oracle price at which this balance would contribute to account liquidation.
	 * Returns zero if liquidation price cannot be calculated.
	 */
	liquidationPrice: BigNum;
}

/**
 * Derives essential balance display information from a User's SpotPosition.
 *
 * Key features:
 * - Calculates net balance (deposits minus borrows) in base asset terms
 * - Computes USD notional value using current oracle price
 * - Determines liquidation price for the specific market
 * - Handles edge cases like zero balances and invalid liquidation prices
 *
 * @param velocityClient - The VelocityClient instance.
 * @param user - The User instance.
 * @param marketIndex - The market index for the spot market.
 * @param oraclePrice - The oracle price for the spot market.
 *
 * @returns SpotBalanceInfo object containing the three essential balance metrics
 */
export const getSpotBalanceInfo = (
	velocityClient: VelocityClient,
	user: User,
	marketIndex: number,
	oraclePrice: BN
): SpotBalanceInfo => {
	const spotMarketConfig = getMarketConfig(
		velocityClient.env,
		MarketType.SPOT,
		marketIndex
	);

	const baseBalance = user.getTokenAmount(marketIndex);
	const baseBalanceBigNum = BigNum.from(
		baseBalance,
		spotMarketConfig.precisionExp
	);

	const notionalBalance = baseBalanceBigNum
		.mul(BigNum.from(oraclePrice, PRICE_PRECISION_EXP))
		.shiftTo(QUOTE_PRECISION_EXP);

	const liqPrice = user.spotLiquidationPrice(marketIndex);
	const liquidationPrice = BigNum.from(liqPrice, PRICE_PRECISION_EXP);

	return {
		marketIndex,
		baseBalance: baseBalanceBigNum,
		notionalBalance,
		liquidationPrice,
	};
};

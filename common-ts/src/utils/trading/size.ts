import {
	AMM_RESERVE_PRECISION,
	BN,
	BigNum,
	VelocityClient,
	MAX_LEVERAGE_ORDER_SIZE,
	ONE,
	PRICE_PRECISION,
	PerpMarketAccount,
	SpotMarketAccount,
	ZERO,
} from '@velocity-exchange/sdk';
import { PRESETS, formatText } from '../../format/index';
import { MarketId } from '../../types';

const getMarketTickSize = (
	velocityClient: VelocityClient,
	marketId: MarketId
): BN => {
	const marketAccount = marketId.isPerp
		? velocityClient.getPerpMarketAccount(marketId.marketIndex)
		: velocityClient.getSpotMarketAccount(marketId.marketIndex);
	if (!marketAccount) return ZERO;

	if (marketId.isPerp) {
		return (marketAccount as PerpMarketAccount).orderTickSize;
	} else {
		return (marketAccount as SpotMarketAccount).orderTickSize;
	}
};

const getMarketTickSizeDecimals = (
	velocityClient: VelocityClient,
	marketId: MarketId
) => {
	const tickSize = getMarketTickSize(velocityClient, marketId);

	const decimalPlaces = Math.max(
		0,
		Math.floor(
			Math.log10(
				PRICE_PRECISION.div(tickSize.eq(ZERO) ? ONE : tickSize).toNumber()
			)
		)
	);

	return decimalPlaces;
};

const getMarketStepSize = (
	velocityClient: VelocityClient,
	marketId: MarketId
) => {
	const marketAccount = marketId.isPerp
		? velocityClient.getPerpMarketAccount(marketId.marketIndex)
		: velocityClient.getSpotMarketAccount(marketId.marketIndex);
	if (!marketAccount) return ZERO;

	if (marketId.isPerp) {
		return (marketAccount as PerpMarketAccount).orderStepSize;
	} else {
		return (marketAccount as SpotMarketAccount).orderStepSize;
	}
};

const getMarketStepSizeDecimals = (
	velocityClient: VelocityClient,
	marketId: MarketId
) => {
	const stepSize = getMarketStepSize(velocityClient, marketId);

	const decimalPlaces = Math.max(
		0,
		Math.floor(
			Math.log10(
				AMM_RESERVE_PRECISION.div(stepSize.eq(ZERO) ? ONE : stepSize).toNumber()
			)
		)
	);

	return decimalPlaces;
};

/**
 * Checks if a given order amount represents an entire position order
 * by comparing it with MAX_LEVERAGE_ORDER_SIZE
 * @param orderAmount - The BigNum order amount to check
 * @returns true if the order is for the entire position, false otherwise
 */
export const isEntirePositionOrder = (orderAmount: BigNum): boolean => {
	const maxLeverageSize = new BigNum(
		MAX_LEVERAGE_ORDER_SIZE,
		orderAmount.precision
	);

	const isMaxLeverage = Math.abs(maxLeverageSize.sub(orderAmount).toNum()) < 1;

	// Some order paths produce a truncated u64::MAX instead of MAX_LEVERAGE_ORDER_SIZE
	const ALTERNATIVE_MAX_ORDER_SIZE = '18446744072000000000';
	const alternativeMaxSize = new BigNum(
		ALTERNATIVE_MAX_ORDER_SIZE,
		orderAmount.precision
	);
	const isAlternativeMax =
		Math.abs(alternativeMaxSize.sub(orderAmount).toNum()) < 1;

	return isMaxLeverage || isAlternativeMax;
};

/**
 * Gets the MAX_LEVERAGE_ORDER_SIZE as a BigNum with the same precision as the given amount
 * @param orderAmount - The BigNum order amount to match precision with
 * @returns BigNum representation of MAX_LEVERAGE_ORDER_SIZE
 */
export const getMaxLeverageOrderSize = (orderAmount: BigNum): BigNum => {
	return new BigNum(MAX_LEVERAGE_ORDER_SIZE, orderAmount.precision);
};

/**
 * Formats an order size for display, showing "Entire Position" if it's a max leverage order
 * @param orderAmount - The BigNum order amount to format
 * @param formatFn - Optional custom format function, defaults to prettyPrint()
 * @returns Formatted string showing either "Entire Position" or the formatted amount
 *
 * @deprecated Use `formatText(amount, PRESETS.orderSize)` from
 * '@velocity-exchange/common/format'.
 */
export const formatOrderSize = (
	orderAmount: BigNum,
	formatFn?: (amount: BigNum) => string
): string => {
	// The sentinel in PRESETS.orderSize matches the marker units exactly, where
	// this check also catches an amount a step size moved off them.
	if (isEntirePositionOrder(orderAmount)) {
		return 'Entire Position';
	}
	return formatFn
		? formatFn(orderAmount)
		: formatText(orderAmount, PRESETS.orderSize);
};

export {
	getMarketTickSize,
	getMarketTickSizeDecimals,
	getMarketStepSize,
	getMarketStepSizeDecimals,
};

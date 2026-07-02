import { BN, MARGIN_PRECISION, User } from '@velocity-exchange/sdk';
import { logger } from '../logger';

const convertLeverageToMarginRatio = (leverage: number): number | undefined => {
	if (!leverage) return undefined;
	return Math.round((1 / leverage) * MARGIN_PRECISION.toNumber());
};

const convertMarginRatioToLeverage = (
	marginRatio: number,
	decimals?: number
): number | undefined => {
	if (!marginRatio) return undefined;

	const leverage = 1 / (marginRatio / MARGIN_PRECISION.toNumber());

	return decimals
		? parseFloat(leverage.toFixed(decimals))
		: Math.round(leverage);
};

/**
 * Calculate the margin used for a specific perp position
 * Returns the minimum of user's total collateral or the position's weighted value
 */
const getMarginUsedForPosition = (
	user: User,
	marketIndex: number,
	includeOpenOrders = true
): BN | undefined => {
	const perpPosition = user.getPerpPosition(marketIndex);
	if (!perpPosition) return undefined;

	const hc = user.getPerpPositionHealth({
		marginCategory: 'Initial',
		perpPosition,
		includeOpenOrders,
	});
	const userCollateral = user.getTotalCollateral();
	return userCollateral.lt(hc.weightedValue)
		? userCollateral
		: hc.weightedValue;
};

/**
 * Validate if a leverage change would exceed the user's free collateral
 * Returns true if the change is valid (doesn't exceed free collateral), false otherwise
 */
const validateLeverageChange = ({
	user,
	marketIndex,
	newLeverage,
}: {
	user: User;
	marketIndex: number;
	newLeverage: number;
}): boolean => {
	try {
		const newMarginRatio = convertLeverageToMarginRatio(newLeverage);
		if (!newMarginRatio) return true;

		const perpPosition = user.getPerpPosition(marketIndex);
		if (!perpPosition) return true;

		const currentPositionWeightedValue = user.getPerpPositionHealth({
			marginCategory: 'Initial',
			perpPosition,
		}).weightedValue;

		const modifiedPosition = {
			...perpPosition,
			maxMarginRatio: newMarginRatio,
		};

		const newPositionWeightedValue = user.getPerpPositionHealth({
			marginCategory: 'Initial',
			perpPosition: modifiedPosition,
		}).weightedValue;

		const perpPositionWeightedValueDelta = newPositionWeightedValue.sub(
			currentPositionWeightedValue
		);

		const freeCollateral = user.getFreeCollateral();

		return perpPositionWeightedValueDelta.lte(freeCollateral);
	} catch (error) {
		logger.warn('Error validating leverage change:', error);
		return true; // Allow change if validation fails
	}
};

export {
	convertLeverageToMarginRatio,
	convertMarginRatioToLeverage,
	getMarginUsedForPosition,
	validateLeverageChange,
};

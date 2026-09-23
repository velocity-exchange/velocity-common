import { MARGIN_PRECISION } from '@velocity-exchange/sdk';
import { fromParts, roundToDecimals, toLossyNumber } from '../../format/core';

const MARGIN_PRECISION_BIGINT = BigInt(MARGIN_PRECISION.toString());

/**
 * MARGIN_PRECISION/marginRatio to `decimals` places, half-up, via one guard
 * digit. Falls back to `legacy` outside a positive integer marginRatio and a
 * non-negative integer decimals, where the guard digit math doesn't apply.
 */
const exactLeverageFromMarginRatio = (
	marginRatio: number,
	decimals: number,
	legacy: number
): number => {
	if (
		!Number.isInteger(marginRatio) ||
		marginRatio <= 0 ||
		!Number.isInteger(decimals) ||
		decimals < 0
	) {
		return legacy;
	}

	const guardScale = decimals + 1;
	const numerator = MARGIN_PRECISION_BIGINT * BigInt(10) ** BigInt(guardScale);
	const scaled = numerator / BigInt(marginRatio);
	const guarded = fromParts(1, scaled.toString(), guardScale);
	return toLossyNumber(roundToDecimals(guarded, decimals, 'half-up'));
};

export { exactLeverageFromMarginRatio };

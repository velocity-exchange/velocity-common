export const TRADE_PRECISION = 6;

export const valueIsBelowStepSize = (value: string, stepSize: number) => {
	const parsedValue = parseFloat(value);

	if (isNaN(parsedValue)) return false;

	return parsedValue < stepSize;
};

/**
 * Kept for one internal caller (`utils/orderbook`'s bucket rounding), which
 * needs the tolerance: `isExactMultiple` rejects the quotients this accepts,
 * and that swap would change orderbook grouping, not just remove a shim.
 *
 * The `|remainder - 1| < 1e-6` branch accepts a quotient that landed just under
 * the next integer, so numbers within one part in 1e6 of dividing are treated
 * as dividing. It is also asymmetric: a remainder just above zero is rejected
 * while a remainder just below one is accepted. `isExactMultiple` rejects both.
 */
export const dividesExactly = (numerator: number, denominator: number) => {
	const division = numerator / denominator;
	const remainder = division % 1;

	if (remainder === 0) return true;

	if (Math.abs(remainder - 1) < 1 / 10 ** 6) return true;

	return false;
};

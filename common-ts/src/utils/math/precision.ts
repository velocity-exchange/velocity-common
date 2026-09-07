import { BN, SpotMarketConfig } from '@velocity-exchange/sdk';

export const TRADE_PRECISION = 6;

export const truncateInputToPrecision = (
	input: string,
	marketPrecisionExp: SpotMarketConfig['precisionExp']
) => {
	const decimalPlaces = input.split('.')[1]?.length ?? 0;
	const maxDecimals = marketPrecisionExp.toNumber();

	if (decimalPlaces > maxDecimals) {
		return input.slice(0, input.length - (decimalPlaces - maxDecimals));
	}

	return input;
};

export const roundToStepSize = (value: string, stepSize?: number) => {
	const stepSizeExp = stepSize?.toString().split('.')[1]?.length ?? 0;
	const truncatedValue = truncateInputToPrecision(value, new BN(stepSizeExp));

	if (truncatedValue.charAt(truncatedValue.length - 1) === '.') {
		return truncatedValue.slice(0, -1);
	}

	return truncatedValue;
};

export const roundToStepSizeIfLargeEnough = (
	value: string,
	stepSize?: number
) => {
	const parsedValue = parseFloat(value);
	if (isNaN(parsedValue) || stepSize === 0 || !value || parsedValue === 0) {
		return value;
	}

	return roundToStepSize(value, stepSize);
};

export const valueIsBelowStepSize = (value: string, stepSize: number) => {
	const parsedValue = parseFloat(value);

	if (isNaN(parsedValue)) return false;

	return parsedValue < stepSize;
};

/**
 * @deprecated Prefer `isExactMultiple` from
 * `@velocity-exchange/common/format`, but read the tolerance note first: this
 * is NOT an exact check and swapping it is a behaviour change.
 *
 * `5.1 / 0.1` is `50.99999999999999` in floats, so the modulo alone reports 5.1
 * as not fitting 0.1. This rounds the quotient to 9 decimals before testing it
 * for integrality, so the tolerance is on the quotient: a value within about
 * 1e-9 steps, that is 1e-9 times the step, is pulled onto the lattice.
 * `isExactMultiple` returns false for those.
 */
export const numbersFitEvenly = (
	numberOne: number,
	numberTwo: number
): boolean => {
	if (isNaN(numberOne) || isNaN(numberTwo)) return false;
	if (numberOne === 0 || numberTwo === 0) return true;

	return (
		Number.isInteger(Number((numberOne / numberTwo).toFixed(9))) ||
		numberOne % numberTwo === 0
	);
};

/**
 * @deprecated Prefer `isExactMultiple` from
 * `@velocity-exchange/common/format`, but read the tolerance note first: this
 * is NOT an exact check and swapping it is a behaviour change.
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

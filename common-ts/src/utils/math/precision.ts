import { SpotMarketConfig } from '@velocity-exchange/sdk';
import { DECIMAL_SEPARATOR } from '../../format/locale';
import {
	capStringFractionDigits,
	stepFractionDigits,
} from '../../format/market';

export const TRADE_PRECISION = 6;

/**
 * Delegates the digit maths to `capStringFractionDigits`, then restores two
 * shapes callers still read: an in-progress leading separator, and the
 * trailing separator at zero fraction digits that `roundToStepSize` strips.
 */
const capToFractionDigits = (input: string, maxFractionDigits: number) => {
	if (typeof input !== 'string' || input === '') return input;

	const capped = capStringFractionDigits(input, { maxFractionDigits });
	if (capped === input) return input;

	const sep = input.lastIndexOf(DECIMAL_SEPARATOR);
	if (maxFractionDigits === 0) {
		const head = input.slice(0, sep);
		return `${head}${DECIMAL_SEPARATOR}`;
	}
	// slice(1) drops the '0' head the core injects ahead of a leading separator.
	return sep === 0 ? capped.slice(1) : capped;
};

/**
 * @deprecated Use `capStringFractionDigits` from
 * `@velocity-exchange/common/format`.
 */
export const truncateInputToPrecision = (
	input: string,
	marketPrecisionExp: SpotMarketConfig['precisionExp']
) => capToFractionDigits(input, marketPrecisionExp.toNumber());

/**
 * @deprecated Use `capStringFractionDigits` with `stepFractionDigits(step)`
 * from `@velocity-exchange/common/format`.
 *
 * The allowed digit count now comes from an exact decimal parse of the step
 * instead of `Number.prototype.toString`, which counted the digits of the
 * exponential string, not of the step, for steps below 1e-6.
 */
export const roundToStepSize = (value: string, stepSize?: number) => {
	const truncatedValue = capToFractionDigits(
		value,
		stepFractionDigits(stepSize)
	);

	if (truncatedValue.charAt(truncatedValue.length - 1) === DECIMAL_SEPARATOR) {
		return truncatedValue.slice(0, -1);
	}

	return truncatedValue;
};

/**
 * @deprecated Use `capStringFractionDigits` with `stepFractionDigits(step)`
 * from `@velocity-exchange/common/format`.
 */
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

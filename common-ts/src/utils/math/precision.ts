import { SpotMarketConfig } from '@velocity-exchange/sdk';
import {
	capStringFractionDigits,
	stepFractionDigits,
} from '../../format/market';

export const TRADE_PRECISION = 6;

/**
 * Delegates the digit maths to `capStringFractionDigits`, then restores two
 * shapes the old slice-based implementation produced and callers still read:
 * a bare in-progress '.5' keeps its leading separator instead of gaining a '0',
 * and at zero fraction digits the separator survives ('1.23' -> '1.'), which is
 * what `roundToStepSize` then strips.
 *
 * The head is taken from the LAST separator, the same one the core split on, so
 * malformed multi-separator input keeps its leading text ('1.2.3' at zero digits
 * is still '1.2.'). What did move is how many digits such input is allowed:
 * the old code counted them after the FIRST separator, so '.1.23456' looked
 * like one fraction digit and survived a two-digit cap; the core counts the five
 * after the last and caps them to '.1.23'.
 */
const capToFractionDigits = (input: string, maxFractionDigits: number) => {
	const capped = capStringFractionDigits(input, { maxFractionDigits });
	if (capped === input) return input;

	const sep = input.lastIndexOf('.');
	const head = input.slice(0, sep);
	if (maxFractionDigits === 0) return `${head}.`;
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
 * rather than `Number.prototype.toString`, which stringifies steps below 1e-6
 * exponentially ('1e-7') and so reported zero decimals: '1.2345678' at a 1e-7
 * step collapsed to '1'.
 */
export const roundToStepSize = (value: string, stepSize?: number) => {
	const truncatedValue = capToFractionDigits(
		value,
		stepFractionDigits(stepSize)
	);

	if (truncatedValue.charAt(truncatedValue.length - 1) === '.') {
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
 * for integrality, which pulls values within ~1e-9 of a lattice point onto it.
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

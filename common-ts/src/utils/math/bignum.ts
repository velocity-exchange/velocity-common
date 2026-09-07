import { BigNum, BN } from '@velocity-exchange/sdk';
import {
	Decimal,
	roundToDecimals,
	shiftPoint,
	toDecimal,
	toFixedPointParts,
} from '../../format/core';
import { snapValueToStep } from '../../format/market';

const toBigNum = (value: Decimal, precision: BN): BigNum => {
	const parts = toFixedPointParts(value, precision.toNumber(), 'truncate');
	const units = new BN(parts.units);
	return BigNum.from(parts.sign === -1 ? units.neg() : units, precision);
};

const requireDecimal = (bignum: BigNum): Decimal => {
	const parsed = toDecimal(bignum);
	if (parsed.status !== 'ok' || !parsed.value) {
		throw new Error(`BigNum ${bignum.toString()} is not a finite value`);
	}
	return parsed.value;
};

/**
 * @deprecated Use `roundToDecimals(value, decimalPlaces, 'half-ceil')` from
 * `@velocity-exchange/common/format/core`.
 *
 * Now exact half-ceil, so ties still go toward +Infinity exactly as
 * `Math.round` did (`-1.5` at 0dp is still `-1`). What changes is that the
 * value no longer goes through `toNum()`: a double that cannot hold the value
 * used to round off the wrong neighbour (`1.005` at 2dp gave `1.00`), and
 * digits beyond 2^53 used to be lost.
 *
 * A negative `decimalPlaces` still rounds to tens, hundreds and so on, but a
 * non-integer one now throws where the float version returned noise
 * (`Math.pow(10, 1.5)` is not a power of ten, so the result was neither
 * rounded nor exact).
 */
export const roundBigNumToDecimalPlace = (
	bignum: BigNum,
	decimalPlaces: number
): BigNum => {
	if (!Number.isInteger(decimalPlaces)) {
		throw new Error(
			`decimalPlaces must be an integer, got ${String(decimalPlaces)}`
		);
	}
	const value = requireDecimal(bignum);
	if (decimalPlaces >= 0) {
		return toBigNum(
			roundToDecimals(value, decimalPlaces, 'half-ceil'),
			bignum.precision
		);
	}
	// Rounding to tens or hundreds: move the point down by that many places,
	// round to a whole number, move it back.
	const whole = roundToDecimals(
		shiftPoint(value, decimalPlaces),
		0,
		'half-ceil'
	);
	return toBigNum(shiftPoint(whole, -decimalPlaces), bignum.precision);
};

/**
 * @deprecated Use `snapValueToStep(value, step, 'toward-zero')` from
 * `@velocity-exchange/common/format`.
 *
 * Mind the scale when replacing a call site by hand: `snapValueToStep` takes a
 * real decimal step, so the raw step BN has to be paired with the value's own
 * precision exponent, exactly as it is below, or the step is read at the wrong
 * magnitude.
 */
export const getBigNumRoundedToStepSize = (baseSize: BigNum, stepSize: BN) => {
	const snapped = snapValueToStep(
		{ raw: baseSize.val, scale: baseSize.precision },
		{ raw: stepSize, scale: baseSize.precision },
		'toward-zero'
	);
	if (!snapped) {
		throw new Error(
			`Cannot snap ${baseSize.toString()} to step ${stepSize.toString()}`
		);
	}
	return toBigNum(snapped, baseSize.precision);
};

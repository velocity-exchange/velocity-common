import { BigNum, BN } from '@velocity-exchange/sdk';
import {
	Decimal,
	roundToDecimals,
	shiftPoint,
	toDecimal,
	toFixedPointParts,
} from '../../format/core';
import { snapValueToStep } from '../../format/market';

const toBigNum = (value: Decimal, scale: number, precision: BN): BigNum => {
	const parts = toFixedPointParts(value, scale, 'truncate');
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
 * Exact half-ceil rounding of a BigNum: ties go toward +Infinity, as
 * `Math.round` did (`-1.5` at 0dp is still `-1`). A negative `decimalPlaces`
 * rounds to tens, hundreds and so on. A non-integer one throws, where the
 * float version returned noise.
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
	const scale = bignum.precision.toNumber();
	const value = requireDecimal(bignum);
	if (decimalPlaces >= 0) {
		return toBigNum(
			roundToDecimals(value, decimalPlaces, 'half-ceil'),
			scale,
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
	return toBigNum(shiftPoint(whole, -decimalPlaces), scale, bignum.precision);
};

/**
 * @deprecated Use `snapValueToStep(value, step, 'toward-zero')` from
 * `@velocity-exchange/common/format`, pairing the step BN with `baseSize.val`
 * at one shared scale, or the step is read at the wrong magnitude.
 *
 * A zero or negative step now throws instead of returning the value unchanged.
 */
export const getBigNumRoundedToStepSize = (baseSize: BigNum, stepSize: BN) => {
	// Snapping in raw units gives the same result at every precision and needs
	// no fixed-point scale, which a negative precision exponent has no room for.
	const snapped = snapValueToStep(
		{ raw: baseSize.val, scale: 0 },
		{ raw: stepSize, scale: 0 },
		'toward-zero'
	);
	if (!snapped) {
		throw new Error(
			`Cannot snap ${baseSize.toString()} to step ${stepSize.toString()}`
		);
	}
	return toBigNum(snapped, 0, baseSize.precision);
};

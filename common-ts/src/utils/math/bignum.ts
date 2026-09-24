import { BigNum, BN } from '@velocity-exchange/sdk';
import {
	Decimal,
	roundToDecimals,
	shiftPoint,
	toDecimal,
	toFixedPointParts,
} from '../../format/core';

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

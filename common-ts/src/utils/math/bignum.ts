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
 * @deprecated Use `roundToDecimals(value, decimalPlaces, 'half-up')` from
 * `@velocity-exchange/common/format/core`.
 *
 * Now exact half-up, with ties away from zero. The old implementation went
 * through `toNum()`, so it inherited two float faults: ties on negatives went
 * toward +Infinity (`-1.5` at 0dp gave `-1`, not `-2`) and doubles that cannot
 * hold the value rounded the wrong way (`1.005` at 2dp gave `1.00`).
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
			roundToDecimals(value, decimalPlaces, 'half-up'),
			bignum.precision
		);
	}
	// Rounding to tens or hundreds: move the point down by that many places,
	// round to a whole number, move it back.
	const whole = roundToDecimals(shiftPoint(value, decimalPlaces), 0, 'half-up');
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

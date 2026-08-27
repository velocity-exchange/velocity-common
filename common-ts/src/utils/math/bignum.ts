import { BigNum, BN } from '@velocity-exchange/sdk';
import {
	Decimal,
	roundToDecimals,
	toDecimal,
	toFixedPointParts,
} from '../../format/core/index';
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
 * Now exact. The old implementation went through `toNum()`, so it inherited two
 * float faults: ties on negatives went toward +Infinity (`-1.5` at 0dp gave
 * `-1`, not `-2`) and doubles that cannot hold the value rounded the wrong way
 * (`1.005` at 2dp gave `1.00`).
 */
export const roundBigNumToDecimalPlace = (
	bignum: BigNum,
	decimalPlaces: number
): BigNum => {
	const rounded = roundToDecimals(
		requireDecimal(bignum),
		decimalPlaces,
		'half-up'
	);
	return toBigNum(rounded, bignum.precision);
};

/**
 * @deprecated Use `snapValueToStep(value, step, 'toward-zero')` from
 * `@velocity-exchange/common/format`.
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

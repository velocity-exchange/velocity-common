import { BN, BigNum } from '@velocity-exchange/sdk';
import { Decimal, rescale, toFixedPointParts } from '../core/index';

// The one file in this layer that loads the SDK at runtime, so it is published
// from the package root and never from the ./format barrel, which stays
// importable without pulling the SDK in behind it.

/**
 * Exact fixed-point conversion. The result carries `precisionExp` as its
 * precision, so it feeds order params and BigNum arithmetic unchanged.
 *
 * A value below `precisionExp` scales up by padding zeros. A value above it
 * throws unless every dropped digit is a zero, because this layer never
 * discards digits silently: round to the target scale first if that is what
 * you want. The sign lives on the BN, so a negative round-trips and every zero
 * is unsigned, including the `-0` a user can type. The rounding mode below is
 * inert, because `rescale` has already put the value on the target scale.
 */
export function toBigNum(value: Decimal, precisionExp: number): BigNum {
	const parts = toFixedPointParts(
		rescale(value, precisionExp),
		precisionExp,
		'truncate'
	);
	const units = new BN(parts.units);
	return BigNum.from(
		parts.sign === -1 ? units.neg() : units,
		new BN(precisionExp)
	);
}

import { zeros } from './digits';
import { roundToDecimals } from './round';
import { Decimal, FixedPointParts, RoundingMode } from './types';

/** Splits into the unsigned integer and fraction digit strings. Never rounds. */
export function toDigitStrings(d: Decimal): {
	integer: string;
	fraction: string;
} {
	const padded =
		d.digits.length > d.scale
			? d.digits
			: zeros(d.scale - d.digits.length + 1) + d.digits;
	const cut = padded.length - d.scale;
	return { integer: padded.slice(0, cut), fraction: padded.slice(cut) };
}

/** Always plain notation. Never emits 'e'. Never emits a group separator. */
export function toPlainString(d: Decimal): string {
	const { integer, fraction } = toDigitStrings(d);
	const sign = d.sign === -1 ? '-' : '';
	return fraction === ''
		? `${sign}${integer}`
		: `${sign}${integer}.${fraction}`;
}

/** The single, named, greppable float exit. */
export function toLossyNumber(d: Decimal): number {
	return Number(toPlainString(d));
}

/** Reconstruct BN/BigNum space without leaving exact space. Caller builds the BN. */
export function toFixedPointParts(
	d: Decimal,
	targetScale: number,
	mode: RoundingMode
): FixedPointParts {
	const rounded = roundToDecimals(d, targetScale, mode);
	return { units: rounded.digits, scale: targetScale, sign: rounded.sign };
}

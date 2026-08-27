import { fromParts } from './construct';
import { compareDigits, trailingZeroCount, zeros } from './digits';
import { Decimal } from './types';

export function isZero(d: Decimal): boolean {
	return d.sign === 0;
}

export function abs(d: Decimal): Decimal {
	return d.sign === -1 ? fromParts(1, d.digits, d.scale) : d;
}

export function negate(d: Decimal): Decimal {
	return d.sign === 0 ? d : fromParts(d.sign === 1 ? -1 : 1, d.digits, d.scale);
}

/** Rescales without losing digits. Throws when the target scale cannot hold the value. */
export function rescale(d: Decimal, scale: number): Decimal {
	if (!Number.isInteger(scale) || scale < 0) {
		throw new Error(
			`Target scale must be a non-negative integer, got ${scale}`
		);
	}
	if (scale === d.scale) return d;
	if (scale > d.scale) {
		return fromParts(d.sign, d.digits + zeros(scale - d.scale), scale);
	}
	const drop = d.scale - scale;
	const dropped = d.digits.slice(Math.max(0, d.digits.length - drop));
	if (/[1-9]/.test(dropped) || d.digits.length < drop) {
		throw new Error(
			`Rescaling ${d.digits}e-${d.scale} to scale ${scale} would lose digits`
		);
	}
	return fromParts(d.sign, d.digits.slice(0, d.digits.length - drop), scale);
}

/** Multiplies by 10^places, exactly. */
export function shiftPoint(d: Decimal, places: number): Decimal {
	if (!Number.isInteger(places)) {
		throw new Error(`shiftPoint places must be an integer, got ${places}`);
	}
	const newScale = d.scale - places;
	if (newScale >= 0) return fromParts(d.sign, d.digits, newScale);
	return fromParts(d.sign, d.digits + zeros(-newScale), 0);
}

export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
	if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1;
	if (a.sign === 0) return 0;
	const scale = Math.max(a.scale, b.scale);
	const left = a.digits + zeros(scale - a.scale);
	const right = b.digits + zeros(scale - b.scale);
	const magnitude = compareDigits(left, right);
	return (magnitude * a.sign) as -1 | 0 | 1;
}

/** Digits from the first non-zero to the last non-zero, inclusive. Zero has none. */
export function significantDigitCount(d: Decimal): number {
	if (d.sign === 0) return 0;
	return d.digits.length - trailingZeroCount(d.digits);
}

/** Fraction digits with trailing zeros trimmed. */
export function fractionDigitCount(d: Decimal): number {
	if (d.sign === 0) return 0;
	return Math.max(0, d.scale - trailingZeroCount(d.digits));
}

/** Digits left of the point, counting the leading '0' of a value below one. */
export function integerDigitCount(d: Decimal): number {
	return Math.max(1, d.digits.length - d.scale);
}

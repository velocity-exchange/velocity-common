import { DIGITS_ONLY, stripLeadingZeros, zeros } from './digits';
import {
	BigNumLike,
	BnLike,
	Decimal,
	NumericInput,
	ParseResult,
	RawWithScale,
} from './types';

const DECIMAL_STRING =
	/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

export const ZERO: Decimal = Object.freeze({
	sign: 0 as const,
	digits: '0',
	scale: 0,
});

function ok(value: Decimal): ParseResult {
	return { status: 'ok', value };
}

function invalid(): ParseResult {
	return { status: 'invalid', value: null };
}

function nullish(): ParseResult {
	return { status: 'nullish', value: null };
}

function nonFinite(sign: -1 | 1): ParseResult {
	return { status: 'non-finite', value: null, nonFiniteSign: sign };
}

export function fromParts(
	sign: -1 | 0 | 1,
	digits: string,
	scale: number
): Decimal {
	if (!Number.isInteger(scale) || scale < 0) {
		throw new Error(
			`Decimal scale must be a non-negative integer, got ${scale}`
		);
	}
	if (typeof digits !== 'string' || !DIGITS_ONLY.test(digits)) {
		throw new Error(`Decimal digits must be a digit string, got ${digits}`);
	}
	const normalised = stripLeadingZeros(digits);
	if (normalised === '0') {
		return Object.freeze({ sign: 0 as const, digits: '0', scale });
	}
	if (sign !== -1 && sign !== 1) {
		throw new Error(`Decimal sign ${sign} is invalid for digits ${normalised}`);
	}
	return Object.freeze({ sign, digits: normalised, scale });
}

/**
 * Builds a Decimal from a signed digit string and a scale that may be negative.
 * A negative scale means the units are already shifted left, which is how a
 * BigNum with negative precision and an exponent-form string both arrive.
 */
function fromSignedUnits(units: string, scale: number): ParseResult {
	const negative = units.startsWith('-');
	const bare = units.replace(/^[+-]/, '');
	if (!DIGITS_ONLY.test(bare)) return invalid();
	if (scale >= 0) {
		return ok(fromParts(negative ? -1 : 1, bare, scale));
	}
	return ok(fromParts(negative ? -1 : 1, bare + zeros(-scale), 0));
}

export function fromString(s: string): ParseResult {
	if (typeof s !== 'string') return invalid();
	const trimmed = s.trim();
	if (trimmed === '') return invalid();
	if (/^[+-]?Infinity$/.test(trimmed)) {
		return nonFinite(trimmed.startsWith('-') ? -1 : 1);
	}
	if (!DECIMAL_STRING.test(trimmed)) return invalid();

	const negative = trimmed.startsWith('-');
	const unsigned = trimmed.replace(/^[+-]/, '');
	const [mantissa, exponentPart] = unsigned.split(/[eE]/);
	const exponent = exponentPart === undefined ? 0 : Number(exponentPart);
	const [intPart, fracPart = ''] = mantissa.split('.');
	const allDigits = `${intPart}${fracPart}`;
	const scale = fracPart.length - exponent;
	return fromSignedUnits(`${negative ? '-' : ''}${allDigits}`, scale);
}

/** Exact w.r.t. the double's shortest round-trip string. The loss already happened upstream. */
export function fromNumber(n: number): ParseResult {
	if (typeof n !== 'number' || Number.isNaN(n)) return invalid();
	if (!Number.isFinite(n)) return nonFinite(n > 0 ? 1 : -1);
	return fromString(String(n));
}

function isDecimal(v: object): v is Decimal {
	return (
		typeof (v as Decimal).digits === 'string' &&
		typeof (v as Decimal).scale === 'number' &&
		typeof (v as Decimal).sign === 'number'
	);
}

function isBnLike(v: unknown): v is BnLike {
	return v != null && typeof (v as BnLike).toString === 'function';
}

function scaleOf(v: number | BnLike): number | null {
	if (typeof v === 'number') return Number.isInteger(v) ? v : null;
	if (!isBnLike(v)) return null;
	const parsed = Number(v.toString());
	return Number.isInteger(parsed) ? parsed : null;
}

export function toDecimal(input: NumericInput): ParseResult {
	if (input === null || input === undefined) return nullish();
	if (typeof input === 'string') return fromString(input);
	if (typeof input === 'number') return fromNumber(input);
	if (typeof input !== 'object') return invalid();

	if (isDecimal(input)) {
		if (!DIGITS_ONLY.test(input.digits)) return invalid();
		if (!Number.isInteger(input.scale) || input.scale < 0) return invalid();
		return ok(fromParts(input.sign, input.digits, input.scale));
	}

	const asBigNum = input as BigNumLike;
	if (isBnLike(asBigNum.val) && asBigNum.precision != null) {
		const scale = scaleOf(asBigNum.precision as number | BnLike);
		if (scale === null) return invalid();
		return fromSignedUnits(asBigNum.val.toString(), scale);
	}

	const asRaw = input as RawWithScale;
	if (isBnLike(asRaw.raw) && asRaw.scale !== undefined) {
		const scale = scaleOf(asRaw.scale);
		if (scale === null) return invalid();
		return fromSignedUnits(asRaw.raw.toString(), scale);
	}

	return invalid();
}

import {
	Decimal,
	RoundingMode,
	abs,
	compare,
	roundToSignificant,
	toDecimal,
	toDigitStrings,
} from './core/index';
import { SmallNumberOptions } from './types';

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** The small form keeps the leading significant digits and drops the rest. */
const SMALL_ROUNDING: RoundingMode = 'truncate';

export function toSubscript(n: number): string {
	return String(n)
		.split('')
		.map((c) => SUBSCRIPT_DIGITS[Number(c)] ?? c)
		.join('');
}

export type SmallResult = {
	integer: string;
	fraction: string;
	value: Decimal;
	wasRounded: boolean;
	roundingApplied: RoundingMode | null;
	/** '<' or '>-' for sentinel mode. Rendered outside the sign and currency. */
	prefix?: string;
} | null;

/** Zeros between the decimal point and the first significant digit. */
export function leadingZeroCount(d: Decimal): number {
	if (d.sign === 0) return 0;
	return Math.max(0, d.scale - d.digits.length);
}

export function applySmallNumber(
	value: Decimal,
	options: SmallNumberOptions
): SmallResult {
	if (value.sign === 0) return null;
	const minSignificant = options.minSignificant;
	const maxLeadingZeros = options.maxLeadingZeros ?? 3;
	const magnitude = abs(value);

	if (options.mode === 'sentinel') {
		const parsed = toDecimal(options.sentinelAt);
		if (parsed.status !== 'ok') return null;
		if (compare(magnitude, parsed.value) >= 0) return null;
		const bound = toDigitStrings(parsed.value);
		return {
			integer: bound.integer,
			fraction: bound.fraction,
			value: parsed.value,
			wasRounded: false,
			roundingApplied: null,
			prefix: value.sign === -1 ? '>-' : '<',
		};
	}

	const leadingZeros = leadingZeroCount(value);
	if (leadingZeros <= maxLeadingZeros) return null;

	const reduced =
		minSignificant === undefined
			? value
			: roundToSignificant(value, minSignificant, SMALL_ROUNDING);
	const wasRounded = reduced.digits.length < value.digits.length;
	const roundingApplied = wasRounded ? SMALL_ROUNDING : null;
	if (options.mode === 'significant') {
		const split = toDigitStrings(reduced);
		return {
			integer: split.integer,
			fraction: split.fraction,
			value: reduced,
			wasRounded,
			roundingApplied,
		};
	}

	return {
		integer: '0',
		fraction: `0${toSubscript(leadingZeros)}${reduced.digits}`,
		value: reduced,
		wasRounded,
		roundingApplied,
	};
}

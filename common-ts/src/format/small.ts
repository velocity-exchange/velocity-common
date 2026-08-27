import {
	Decimal,
	abs,
	compare,
	roundToSignificant,
	toDecimal,
	toDigitStrings,
	toPlainString,
} from './core/index';
import { SmallNumberOptions } from './types';

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

export function toSubscript(n: number): string {
	return String(n)
		.split('')
		.map((c) => SUBSCRIPT_DIGITS[Number(c)] ?? c)
		.join('');
}

export type SmallResult =
	| { kind: 'digits'; integer: string; fraction: string; value: Decimal }
	| { kind: 'text'; text: string }
	| null;

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
	const minSignificant = options.minSignificant ?? 3;
	const maxLeadingZeros = options.maxLeadingZeros ?? 3;
	const magnitude = abs(value);

	if (options.mode === 'sentinel') {
		const parsed = toDecimal(options.sentinelAt);
		if (parsed.status !== 'ok' || !parsed.value) return null;
		if (compare(magnitude, parsed.value) >= 0) return null;
		const bound = toPlainString(parsed.value);
		return {
			kind: 'text',
			text: value.sign === -1 ? `>-${bound}` : `<${bound}`,
		};
	}

	const leadingZeros = leadingZeroCount(value);
	if (leadingZeros <= maxLeadingZeros) return null;

	const reduced = roundToSignificant(value, minSignificant, 'truncate');
	if (options.mode === 'significant') {
		const split = toDigitStrings(reduced);
		return {
			kind: 'digits',
			integer: split.integer,
			fraction: split.fraction,
			value: reduced,
		};
	}

	return {
		kind: 'digits',
		integer: '0',
		fraction: `0${toSubscript(leadingZeros)}${reduced.digits}`,
		value: reduced,
	};
}

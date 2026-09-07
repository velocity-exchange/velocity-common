import {
	Decimal,
	RoundingMode,
	fractionDigitCount,
	roundToDecimals,
	roundToSignificant,
	significantDigitCount,
	toDigitStrings,
} from './core/index';
import { sizeDecimalsFromPrice } from './market';
import { trimFractionZeros } from './trim';
import { DigitSpec, MarketPrecision } from './types';

export interface ResolvedDigits {
	/** 'invalid' when the spec needs data the caller did not supply. */
	status: 'ok' | 'invalid';
	value: Decimal;
	integer: string;
	fraction: string;
	wasRounded: boolean;
	roundedAway: boolean;
	roundingApplied: RoundingMode | null;
}

/** The type makes this unreachable from TypeScript; it still guards JS callers. */
function requireMode(
	spec: Exclude<DigitSpec, { kind: 'exact' }>
): RoundingMode {
	if (spec.rounding) return spec.rounding;
	throw new Error(
		`A rounding mode is required for digits.kind '${spec.kind}'; there is no default at this layer`
	);
}

/**
 * null means the spec cannot be resolved from what the caller supplied, which
 * is a display-time condition and never a throw.
 */
function decimalsFor(spec: DigitSpec, market?: MarketPrecision): number | null {
	switch (spec.kind) {
		case 'decimals':
			return spec.decimals;
		case 'tick':
			return market ? market.priceDecimals : null;
		case 'step':
			return market ? market.sizeDecimals : null;
		case 'magnitude':
			return sizeDecimalsFromPrice(spec.assetPrice, { max: spec.maxDecimals });
		default:
			return null;
	}
}

/**
 * Matches BigNum.toPrecision(n, true): pad to N significant digits above one,
 * leave the digit count alone below one, and render zero at N-1 decimals.
 * `maxDecimals` caps the padding target, so it can never reintroduce digits the
 * cap just removed.
 */
function padToSignificant(
	value: Decimal,
	integer: string,
	fraction: string,
	significant: number,
	trailingZeros: 'keep' | 'trim',
	maxDecimals?: number
): string {
	if (value.sign === 0) {
		const zeroDecimals =
			maxDecimals === undefined
				? significant - 1
				: Math.min(significant - 1, maxDecimals);
		return '0'.repeat(Math.max(0, zeroDecimals));
	}
	if (integer === '0') {
		return trailingZeros === 'trim' ? trimFractionZeros(fraction) : fraction;
	}
	const target =
		maxDecimals === undefined
			? significant
			: Math.min(significant, integer.length + maxDecimals);
	const rendered = integer.length + fraction.length;
	if (rendered >= target) return fraction;
	return fraction + '0'.repeat(target - rendered);
}

export function applyDigitSpec(
	input: Decimal,
	spec: DigitSpec,
	market?: MarketPrecision
): ResolvedDigits {
	let value = input;
	let mode: RoundingMode | null = null;

	if (spec.kind === 'significant') {
		mode = requireMode(spec);
		value = roundToSignificant(input, spec.significant, mode);
		// The significant pass only decides whether the cap binds. Rounding it a
		// second time would carry twice: 0.1249 at 3sf half-up is 0.125, and
		// capping that at 2 decimals gives 0.13 rather than 0.12.
		if (spec.maxDecimals !== undefined && value.scale > spec.maxDecimals) {
			value = roundToDecimals(input, spec.maxDecimals, mode);
		}
	} else if (spec.kind !== 'exact') {
		const decimals = decimalsFor(spec, market);
		if (decimals === null) {
			return {
				status: 'invalid',
				value: input,
				integer: '',
				fraction: '',
				wasRounded: false,
				roundedAway: false,
				roundingApplied: null,
			};
		}
		mode = requireMode(spec);
		value = roundToDecimals(input, decimals, mode);
	}

	const split = toDigitStrings(value);
	let fraction = split.fraction;
	if (spec.kind === 'significant') {
		fraction = padToSignificant(
			value,
			split.integer,
			fraction,
			spec.significant,
			spec.trailingZeros ?? 'keep',
			spec.maxDecimals
		);
	}

	return {
		status: 'ok',
		value,
		integer: split.integer,
		fraction,
		wasRounded:
			significantDigitCount(value) < significantDigitCount(input) ||
			fractionDigitCount(value) < fractionDigitCount(input),
		roundedAway: input.sign !== 0 && value.sign === 0,
		roundingApplied: mode,
	};
}

/** Minimum fraction padding, applied after any trailing-zero trim. */
export function minDecimalsOf(spec: DigitSpec): number {
	return spec.kind === 'decimals' ? (spec.minDecimals ?? 0) : 0;
}

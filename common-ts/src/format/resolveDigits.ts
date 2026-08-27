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
import { DigitSpec, MarketPrecision } from './types';

export interface ResolvedDigits {
	value: Decimal;
	integer: string;
	fraction: string;
	wasRounded: boolean;
	roundedAway: boolean;
	roundingApplied: RoundingMode | null;
}

function requireMode(spec: DigitSpec, rounding?: RoundingMode): RoundingMode {
	if (rounding) return rounding;
	throw new Error(
		`A rounding mode is required for digits.kind '${spec.kind}'; there is no default at this layer`
	);
}

function decimalsFor(spec: DigitSpec, market?: MarketPrecision): number | null {
	switch (spec.kind) {
		case 'decimals':
			return spec.decimals;
		case 'tick':
			if (!market)
				throw new Error("digits.kind 'tick' requires options.market");
			return market.priceDecimals;
		case 'step':
			if (!market)
				throw new Error("digits.kind 'step' requires options.market");
			return market.sizeDecimals;
		case 'magnitude':
			return sizeDecimalsFromPrice(spec.assetPrice, { max: spec.maxDecimals });
		default:
			return null;
	}
}

/**
 * Matches BigNum.toPrecision(n, true): pad to N significant digits above one,
 * leave the digit count alone below one, and render zero at N-1 decimals.
 */
function padToSignificant(
	value: Decimal,
	integer: string,
	fraction: string,
	significant: number,
	trailingZeros: 'keep' | 'trim'
): string {
	if (value.sign === 0) return '0'.repeat(Math.max(0, significant - 1));
	if (integer === '0') {
		return trailingZeros === 'trim' ? fraction.replace(/0+$/, '') : fraction;
	}
	const rendered = integer.length + fraction.length;
	if (rendered >= significant) return fraction;
	return fraction + '0'.repeat(significant - rendered);
}

export function applyDigitSpec(
	input: Decimal,
	spec: DigitSpec,
	rounding?: RoundingMode,
	market?: MarketPrecision
): ResolvedDigits {
	let value = input;
	let mode: RoundingMode | null = null;

	if (spec.kind === 'significant') {
		mode = requireMode(spec, rounding);
		value = roundToSignificant(input, spec.significant, mode);
		if (spec.maxDecimals !== undefined && value.scale > spec.maxDecimals) {
			value = roundToDecimals(value, spec.maxDecimals, mode);
		}
	} else if (spec.kind !== 'exact') {
		const decimals = decimalsFor(spec, market);
		if (decimals === null) throw new Error(`Unhandled digit spec ${spec.kind}`);
		mode = requireMode(spec, rounding);
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
			spec.trailingZeros ?? 'keep'
		);
	}

	return {
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

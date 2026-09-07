import { Decimal, fractionDigitCount, rescale } from './core/index';

/**
 * Drops trailing zeros from a fraction digit string, then pads back to
 * `minDecimals`. The single trimmer, so the digit path and the render path
 * cannot disagree on what a trimmed fraction looks like.
 */
export function trimFractionZeros(fraction: string, minDecimals = 0): string {
	const trimmed = fraction.replace(/0+$/, '');
	if (trimmed.length >= minDecimals) return trimmed;
	return trimmed + '0'.repeat(minDecimals - trimmed.length);
}

/** The same trim on the value, for a check that reads digits rather than text. */
export function trimDecimalZeros(value: Decimal, minDecimals = 0): Decimal {
	const target = Math.max(fractionDigitCount(value), minDecimals);
	return target >= value.scale ? value : rescale(value, target);
}

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

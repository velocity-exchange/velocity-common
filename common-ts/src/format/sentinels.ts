import { NumericInput, compare, fromParts, toDecimal } from './core/index';
import { SentinelRule } from './types';

/**
 * u64::MAX, plus the truncated variant some order paths produce. Matched on raw
 * units so the rule holds at BASE, QUOTE, or any other precision exponent.
 */
const ENTIRE_POSITION_UNITS = ['18446744073709551615', '18446744072000000000'];

export const ENTIRE_POSITION: SentinelRule = Object.freeze({
	matches: (v: { units: string; scale: number; sign: -1 | 0 | 1 }) =>
		ENTIRE_POSITION_UNITS.includes(v.units),
	text: 'Entire Position',
});

/** Matches every value strictly below `t`, signed. */
export function belowThreshold(t: NumericInput, text: string): SentinelRule {
	const parsed = toDecimal(t);
	if (parsed.status !== 'ok') {
		throw new Error(
			`belowThreshold needs a finite numeric threshold, got ${t}`
		);
	}
	const threshold = parsed.value;
	return {
		matches: (v) =>
			compare(fromParts(v.sign, v.units, v.scale), threshold) === -1,
		text,
	};
}

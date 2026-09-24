import { NumericInput, compare, fromParts, toDecimal } from './core/index';
import { SentinelRule } from './types';

// BigInt literals need target ES2020; this package targets ES2019.
const BIG_ZERO = BigInt(0);

/**
 * u64::MAX, plus the truncated variant some order paths produce. Matched on raw
 * units so the rule holds at BASE, QUOTE, or any other precision exponent.
 */
const ENTIRE_POSITION_UNITS = ['18446744073709551615', '18446744072000000000'];

export const ENTIRE_POSITION: SentinelRule = Object.freeze({
	// Sign matters: the magnitude is a marker written into a positive size, so a
	// negative amount that happens to carry the same units is an ordinary value.
	// The program stores a reduce-only trigger's u64::MAX rounded down to the
	// market step, so a real amount can land up to one step short of a marker.
	// Same tolerance as isEntirePositionOrder: within one printed unit (10^scale
	// raw units).
	matches: (v: { units: string; scale: number; sign: -1 | 0 | 1 }) => {
		if (v.sign !== 1) return false;
		const amount = BigInt(v.units);
		const tolerance = BigInt(10) ** BigInt(v.scale);
		return ENTIRE_POSITION_UNITS.some((marker) => {
			const diff = amount - BigInt(marker);
			return (diff < BIG_ZERO ? -diff : diff) < tolerance;
		});
	},
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

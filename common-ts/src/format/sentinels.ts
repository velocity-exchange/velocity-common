import { NumericInput, compare, fromParts, toDecimal } from './core/index';
import { SentinelRule } from './types';

// The program rounds a reduce-only trigger's u64::MAX down to the market step,
// so match a fixed raw window below it. A precision-scaled window would swallow
// ordinary values at long scales.
const U64_MAX = BigInt('18446744073709551615');
const ENTIRE_POSITION_WINDOW = BigInt('1000000000000');

export const ENTIRE_POSITION: SentinelRule = Object.freeze({
	// Sign matters: the magnitude is a marker written into a positive size, so a
	// negative amount that happens to carry the same units is an ordinary value.
	matches: (v: { units: string; scale: number; sign: -1 | 0 | 1 }) => {
		if (v.sign !== 1) return false;
		const below = U64_MAX - BigInt(v.units);
		return below >= BigInt(0) && below < ENTIRE_POSITION_WINDOW;
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

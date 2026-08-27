import { fromParts } from './construct';
import { incrementDigits, isAllZeros, zeros } from './digits';
import { rescale } from './ops';
import { Decimal, RoundingMode } from './types';

function shouldIncrement(
	sign: -1 | 0 | 1,
	kept: string,
	dropped: string,
	mode: RoundingMode
): boolean {
	if (isAllZeros(dropped)) return false;
	switch (mode) {
		case 'truncate':
			return false;
		case 'floor':
			return sign === -1;
		case 'ceil':
			return sign === 1;
		case 'expand':
			return true;
		case 'half-up':
			return Number(dropped[0]) >= 5;
		case 'half-even': {
			const first = Number(dropped[0]);
			if (first > 5) return true;
			if (first < 5) return false;
			if (!isAllZeros(dropped.slice(1))) return true;
			const lastKept = kept.length === 0 ? 0 : Number(kept[kept.length - 1]);
			return lastKept % 2 === 1;
		}
	}
}

/** Reduces `digits` by `drop` places, applying `mode`. Returns the kept digit string. */
function reduce(
	sign: -1 | 0 | 1,
	digits: string,
	drop: number,
	mode: RoundingMode
): string {
	const cut = Math.max(0, digits.length - drop);
	const kept = digits.slice(0, cut);
	const dropped = zeros(Math.max(0, drop - digits.length)) + digits.slice(cut);
	const base = kept === '' ? '0' : kept;
	return shouldIncrement(sign, kept, dropped, mode)
		? incrementDigits(base)
		: base;
}

export function roundToDecimals(
	d: Decimal,
	decimals: number,
	mode: RoundingMode
): Decimal {
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new Error(`decimals must be a non-negative integer, got ${decimals}`);
	}
	if (decimals >= d.scale) return rescale(d, decimals);
	const reduced = reduce(d.sign, d.digits, d.scale - decimals, mode);
	return fromParts(d.sign, reduced, decimals);
}

/**
 * Significant figures by digit-string reduction, never via a negative decimal
 * place count. If significant < integerDigitCount, low integer digits become
 * zeros (1234567 at 6sf -> 1234570). Magnitude is re-derived after any carry,
 * so 9.999999 at 6sf half-up is 10.0000, not 10.00000.
 */
export function roundToSignificant(
	d: Decimal,
	significant: number,
	mode: RoundingMode
): Decimal {
	if (!Number.isInteger(significant) || significant < 1) {
		throw new Error(
			`significant must be a positive integer, got ${significant}`
		);
	}
	if (d.sign === 0) return d;
	if (d.digits.length <= significant) return d;

	const drop = d.digits.length - significant;
	let reduced = reduce(d.sign, d.digits, drop, mode);
	let scale = d.scale - drop;
	if (reduced.length > significant) {
		reduced = reduced.slice(0, significant);
		scale -= 1;
	}
	if (scale >= 0) return fromParts(d.sign, reduced, scale);
	return fromParts(d.sign, reduced + zeros(-scale), 0);
}

/**
 * Exact fixed-point decimal.
 *   value === sign * Number(digits) * 10^(-scale)
 * Structural mirror of BigNum: digits === bigNum.val.abs().toString(),
 *                              scale  === bigNum.precision.toNumber().
 * Immutable. Zero is { sign: 0, digits: '0', scale } with scale preserved.
 */
export interface Decimal {
	readonly sign: -1 | 0 | 1;
	readonly digits: string;
	readonly scale: number;
}

/** Structural, duck-typed. No SDK import, so no version coupling and no instanceof. */
export interface BnLike {
	toString(base?: number | 'hex'): string;
}

export interface BigNumLike {
	val: BnLike;
	precision: BnLike;
}

export interface RawWithScale {
	raw: BnLike;
	scale: number | BnLike;
}

export type NumericInput =
	| Decimal
	| BigNumLike
	| RawWithScale
	| string
	| number
	| null
	| undefined;

/**
 * All six modes. `truncate` is toward zero (what BigNum.toFixed does today);
 * `floor` is toward negative infinity. They differ on negatives and the
 * difference is load-bearing, so they are never aliases.
 */
export type RoundingMode =
	| 'truncate'
	| 'floor'
	| 'ceil'
	| 'expand'
	| 'half-up'
	| 'half-even';

/** What a value is, when it is not an ordinary number. */
export type DecimalStatus = 'ok' | 'nullish' | 'non-finite' | 'invalid';

export interface ParseResult {
	status: DecimalStatus;
	value: Decimal | null;
	/** For 'non-finite': the sign of the infinity. */
	nonFiniteSign?: -1 | 1;
}

/** `nearest` breaks an exact tie away from zero, so -1.5 at step 1 snaps to -2. */
export type StepMode = 'toward-zero' | 'floor' | 'nearest' | 'ceil';

export interface FixedPointParts {
	units: string;
	scale: number;
	sign: -1 | 0 | 1;
}

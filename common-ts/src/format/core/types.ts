declare const decimalBrand: unique symbol;

/**
 * Exact fixed-point decimal.
 *   value === sign * Number(digits) * 10^(-scale)
 * Structural mirror of BigNum: digits === bigNum.val.abs().toString(),
 *                              scale  === bigNum.precision.toNumber().
 * Immutable. Zero is { sign: 0, digits: '0', scale } with scale preserved.
 *
 * The three fields are stripped from the published types, so a Decimal is
 * built and read only through this folder's functions and a hand-written
 * object cannot pass for one.
 */
export interface Decimal {
	/** @internal */
	readonly sign: -1 | 0 | 1;
	/** @internal */
	readonly digits: string;
	/** @internal */
	readonly scale: number;
	readonly [decimalBrand]: true;
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
 * `truncate` is toward zero (what BigNum.toFixed does today); `floor` is toward
 * negative infinity. They differ on negatives and the difference is
 * load-bearing, so they are never aliases. The two half modes differ on
 * negatives the same way: `half-up` sends an exact tie away from zero, and
 * `half-ceil` sends it toward positive infinity, which is what Math.round does.
 */
export type RoundingMode =
	| 'truncate'
	| 'floor'
	| 'ceil'
	| 'expand'
	| 'half-up'
	| 'half-ceil'
	| 'half-even';

/** What a value is, when it is not an ordinary number. */
export type DecimalStatus = 'ok' | 'nullish' | 'non-finite' | 'invalid';

export type ParseResult =
	| { status: 'ok'; value: Decimal }
	| { status: 'nullish'; value: null }
	/** `nonFiniteSign` is the sign of the infinity. */
	| { status: 'non-finite'; value: null; nonFiniteSign: -1 | 1 }
	| { status: 'invalid'; value: null };

/** `nearest` breaks an exact tie away from zero, so -1.5 at step 1 snaps to -2. */
export type StepMode = 'toward-zero' | 'floor' | 'nearest' | 'ceil';

export interface FixedPointParts {
	units: string;
	scale: number;
	sign: -1 | 0 | 1;
}

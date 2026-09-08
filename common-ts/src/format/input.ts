import {
	Decimal,
	ParseResult,
	fromString,
	roundToDecimals,
} from './core/index';
import { GROUP_SEPARATOR } from './locale';
import { MarketPrecision } from './types';

/** Which field is being typed into, which is what its digit limits follow from. */
export type InputFieldKind =
	| 'default'
	| 'price'
	| 'size'
	| 'notional'
	| 'slippage'
	| 'orderCount'
	| 'leverage';

/** How many digits the mask accepts on each side of the separator. */
export interface DigitCaps {
	maxIntegerDigits: number;
	maxFractionDigits: number;
}

/**
 * The typing caps for every field whose digits do not come from a market.
 * `default`, `orderCount` and `slippage` reproduce the values the inputs
 * hardcode today, so adopting them changes nothing a user can type.
 */
export const DIGIT_CAPS: Readonly<
	Record<Exclude<InputFieldKind, 'price' | 'size'>, Readonly<DigitCaps>>
> = Object.freeze({
	default: Object.freeze({ maxIntegerDigits: 12, maxFractionDigits: 10 }),
	/** Quote precision, so the mask and the outbound truncation agree. */
	notional: Object.freeze({ maxIntegerDigits: 12, maxFractionDigits: 6 }),
	/** Slippage is a percentage capped at 100, and 6 digits is a product call. */
	slippage: Object.freeze({ maxIntegerDigits: 3, maxFractionDigits: 6 }),
	/** Scaled orders top out at 32, and the fraction cap is the default's. */
	orderCount: Object.freeze({ maxIntegerDigits: 2, maxFractionDigits: 10 }),
	leverage: Object.freeze({ maxIntegerDigits: 3, maxFractionDigits: 2 }),
});

/** Everything one input field needs: the mask's settings and the market lattice. */
export interface InputFieldConfig {
	/** Fed to the input mask. en-US only, so it is always 'en-US'. */
	localeTag: string;
	caps: DigitCaps;
	/** The market lattice the submitted value must sit on. */
	step?: Decimal;
	/** Scale for parseInput, and the exponent the fixed-point value is built at. */
	precisionExp?: number;
}

const LOCALE_TAG = 'en-US';

/**
 * One call supplies the mask's caps and the outbound truncation's step.
 *
 * `price` and `size` take their fraction cap, step and precision exponent from
 * the market: the tick for a price, the step for a size. Without a market they
 * fall back to the default caps and carry no step, so a field can render before
 * market data arrives. A market passed for any other kind is ignored, and an
 * unrecognised kind gets the default caps rather than a throw inside a render.
 * Overrides win over both the table and the market, but only where they give a
 * non-negative integer, so an unset prop cannot uncap a field.
 *
 * `precisionExp` for `size` is only as good as the `MarketPrecision` handed in.
 * `marketPrecisionFromAccount` builds every step at base precision, which is
 * right for a perp market; a spot market documents `orderStepSize` in its own
 * decimals, so a spot field must supply a `MarketPrecision` built with the
 * account's native decimals.
 */
export function inputFieldConfig(
	kind: InputFieldKind,
	o?: { market?: MarketPrecision; overrides?: Partial<DigitCaps> }
): InputFieldConfig {
	const resolved = resolveCaps(kind, o?.market);
	return {
		localeTag: LOCALE_TAG,
		...resolved,
		caps: mergeCaps(resolved.caps, o?.overrides),
	};
}

function isDigitCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function mergeCaps(
	base: Readonly<DigitCaps>,
	overrides?: Partial<DigitCaps>
): DigitCaps {
	const caps: DigitCaps = { ...base };
	const integer = overrides?.maxIntegerDigits;
	const fraction = overrides?.maxFractionDigits;
	if (isDigitCount(integer)) caps.maxIntegerDigits = integer;
	if (isDigitCount(fraction)) caps.maxFractionDigits = fraction;
	return caps;
}

function resolveCaps(
	kind: InputFieldKind,
	market?: MarketPrecision
): { caps: Readonly<DigitCaps>; step?: Decimal; precisionExp?: number } {
	if (kind !== 'price' && kind !== 'size') {
		return { caps: DIGIT_CAPS[kind] ?? DIGIT_CAPS.default };
	}
	if (!market) return { caps: DIGIT_CAPS.default };
	const step = kind === 'price' ? market.tick : market.step;
	return {
		caps: {
			maxIntegerDigits: DIGIT_CAPS.default.maxIntegerDigits,
			maxFractionDigits:
				kind === 'price' ? market.priceDecimals : market.sizeDecimals,
		},
		step,
		precisionExp: step.scale,
	};
}

/** Empty, a sign on its own, or a separator the user typed first. */
const NO_DIGITS_YET = /^[+-]?\.?$/;

/**
 * Well past every on-chain precision exponent (9 is the largest in use) and far
 * short of a scale that would pad a value into an unrenderable digit string.
 */
const MAX_PRECISION_EXP = 30;

/**
 * Reads what a user typed into a fixed-point value at `precisionExp`.
 *
 * Group separators are stripped before parsing, so the masked '1,234.5' and the
 * bare '1234.5' agree. An in-progress '12.' parses as 12, exponent forms expand
 * exactly, and fraction digits past `precisionExp` truncate toward zero, which
 * is what the submit path does today. The result always carries scale
 * `precisionExp`, so it feeds toFixedPointParts unchanged.
 *
 * A cleared or half-typed field ('', '  ', '-', '.') is `nullish`, distinct from
 * the `invalid` a garbage string returns, and 'Infinity' keeps its own status.
 * A `precisionExp` that is not a digit count, or is past 30, is `invalid` too.
 */
export function parseInput(input: string, precisionExp: number): ParseResult {
	if (typeof input !== 'string') return { status: 'invalid', value: null };
	if (!isDigitCount(precisionExp) || precisionExp > MAX_PRECISION_EXP) {
		return { status: 'invalid', value: null };
	}
	const bare = input.split(GROUP_SEPARATOR).join('').trim();
	if (NO_DIGITS_YET.test(bare)) return { status: 'nullish', value: null };

	const parsed = fromString(bare);
	if (parsed.status !== 'ok') return parsed;
	return {
		status: 'ok',
		value: roundToDecimals(parsed.value, precisionExp, 'truncate'),
	};
}

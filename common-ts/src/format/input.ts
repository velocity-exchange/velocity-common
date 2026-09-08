import {
	Decimal,
	MAX_EXPONENT_SHIFT,
	ParseResult,
	fromString,
	roundToDecimals,
} from './core/index';
import { GROUP_SEPARATOR } from './locale';
import { MarketPrecision } from './types';

export type InputFieldKind =
	| 'default'
	| 'price'
	| 'size'
	| 'notional'
	| 'slippage'
	| 'orderCount'
	| 'leverage';

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
	Record<Exclude<InputFieldKind, 'price' | 'size'>, DigitCaps>
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
 * market data arrives. A market passed for any other kind is ignored. Overrides
 * win over both the table and the market.
 */
export function inputFieldConfig(
	kind: InputFieldKind,
	o?: { market?: MarketPrecision; overrides?: Partial<DigitCaps> }
): InputFieldConfig {
	const resolved = resolveCaps(kind, o?.market);
	return {
		localeTag: LOCALE_TAG,
		...resolved,
		caps: { ...resolved.caps, ...o?.overrides },
	};
}

function resolveCaps(
	kind: InputFieldKind,
	market?: MarketPrecision
): { caps: DigitCaps; step?: Decimal; precisionExp?: number } {
	if (kind !== 'price' && kind !== 'size') return { caps: DIGIT_CAPS[kind] };
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
 */
export function parseInput(input: string, precisionExp: number): ParseResult {
	if (typeof input !== 'string') return { status: 'invalid', value: null };
	if (
		!Number.isInteger(precisionExp) ||
		precisionExp < 0 ||
		precisionExp > MAX_EXPONENT_SHIFT
	) {
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

import {
	Decimal,
	ParseResult,
	capFractionDigits,
	fromString,
} from './core/index';
import { ungroup } from './grouping';
import { LocaleConfig, getDefaultLocale } from './locale';
import { stepFractionDigits } from './market';
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
 * One table replacing the four independently reasoned magic numbers in the UI.
 * The slippage 6-digit cap is a product decision, not a scientific-notation
 * workaround: 7 digits pushed the masked field into exponential form.
 */
export const DIGIT_CAPS: Readonly<
	Record<Exclude<InputFieldKind, 'price' | 'size'>, DigitCaps>
> = Object.freeze({
	default: Object.freeze({ maxIntegerDigits: 12, maxFractionDigits: 10 }),
	notional: Object.freeze({ maxIntegerDigits: 12, maxFractionDigits: 10 }),
	slippage: Object.freeze({ maxIntegerDigits: 3, maxFractionDigits: 6 }),
	orderCount: Object.freeze({ maxIntegerDigits: 2, maxFractionDigits: 10 }),
	leverage: Object.freeze({ maxIntegerDigits: 3, maxFractionDigits: 2 }),
});

export interface InputFieldConfig {
	/** Fed to @react-input/number-format. */
	localeTag: string;
	/** Fed to the display path, so the two sides cannot disagree on separators. */
	locale: LocaleConfig;
	caps: DigitCaps;
	step?: Decimal;
	precisionExp?: number;
}

export function inputFieldConfig(
	kind: InputFieldKind,
	o?: { market?: MarketPrecision; overrides?: Partial<DigitCaps> }
): InputFieldConfig {
	const locale = getDefaultLocale();
	const market = o?.market;

	let caps: DigitCaps;
	let step: Decimal | undefined;

	if (kind === 'price') {
		if (!market) throw new Error("inputFieldConfig('price') requires a market");
		caps = {
			maxIntegerDigits: DIGIT_CAPS.default.maxIntegerDigits,
			maxFractionDigits: market.priceDecimals,
		};
		step = market.tick;
	} else if (kind === 'size') {
		if (!market) throw new Error("inputFieldConfig('size') requires a market");
		caps = {
			maxIntegerDigits: DIGIT_CAPS.default.maxIntegerDigits,
			maxFractionDigits: market.sizeDecimals,
		};
		step = market.step;
	} else {
		caps = { ...DIGIT_CAPS[kind] };
	}

	if (o?.overrides) caps = { ...caps, ...o.overrides };

	// Derived last, from the final caps, so the mask and the outbound parse can
	// never disagree on how many fraction digits survive.
	const precisionExp = step
		? Math.min(caps.maxFractionDigits, stepFractionDigits(step))
		: caps.maxFractionDigits;

	return { localeTag: locale.tag, locale, caps, step, precisionExp };
}

/**
 * Locale-aware string to exact Decimal. Group separators are stripped, the
 * locale decimal separator is normalised, and the result is capped at
 * `precisionExp` fraction digits rather than silently truncated at 9 the way
 * BigNum.fromPrint does.
 */
export function parseInput(
	input: string,
	precisionExp: number,
	locale: LocaleConfig = getDefaultLocale()
): ParseResult {
	if (typeof input !== 'string') return { status: 'invalid', value: null };
	const trimmed = input.trim();
	// A group separator after the decimal one means the text follows a different
	// locale's convention. Stripping it would rescale the value instead of
	// failing, so "1,234.56" read as de-DE is rejected, not parsed as 1.23.
	if (locale.group !== '' && locale.decimal !== '') {
		const decimalAt = trimmed.indexOf(locale.decimal);
		if (decimalAt !== -1 && trimmed.indexOf(locale.group, decimalAt) !== -1) {
			return { status: 'invalid', value: null };
		}
	}
	const bare = ungroup(trimmed, locale);
	const normalised =
		locale.decimal === '.' ? bare : bare.split(locale.decimal).join('.');
	const parsed = fromString(normalised);
	if (parsed.status !== 'ok' || !parsed.value) return parsed;
	return { status: 'ok', value: capFractionDigits(parsed.value, precisionExp) };
}

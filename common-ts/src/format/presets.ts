import { ENTIRE_POSITION } from './sentinels';
import {
	DigitSpec,
	FormatOptions,
	LegacyNumberType,
	SentinelRule,
} from './types';

const NON_POSITIVE_LEVERAGE: SentinelRule = {
	matches: (v) => v.sign !== 1,
	text: '1x',
};

const ZERO_PRICE: SentinelRule = {
	matches: (v) => v.sign === 0,
	text: '0.00',
};

const ZERO_AMOUNT: SentinelRule = {
	matches: (v) => v.sign === 0,
	text: '0',
};

/** Recursive, because every nested digits/abbreviate/sentinel object is shared. */
function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	Object.freeze(value);
	for (const key of Object.getOwnPropertyNames(value)) {
		deepFreeze((value as Record<string, unknown>)[key]);
	}
	return value;
}

const freeze = (o: FormatOptions): FormatOptions => deepFreeze(o);

/**
 * `usdLegacy` reproduces today's truncate-toward-zero cent, which is what every
 * BigNum.toNotional call site renders. `usd` carries the same semantics but is
 * its own object, so flipping it to half-up leaves the deliberate legacy call
 * sites alone. `usdHalfUp` is the flip target.
 */
const usdLegacy = freeze({
	style: 'currency' as const,
	digits: {
		kind: 'decimals' as const,
		decimals: 2,
		rounding: 'truncate' as const,
	},
});

const usd = freeze({
	style: 'currency' as const,
	digits: {
		kind: 'decimals' as const,
		decimals: 2,
		rounding: 'truncate' as const,
	},
});

const usdHalfUp = freeze({
	style: 'currency' as const,
	digits: {
		kind: 'decimals' as const,
		decimals: 2,
		rounding: 'half-up' as const,
	},
});

/** A trade price at full precision. Shared by the two price presets below. */
const PRICE_DIGITS: DigitSpec = deepFreeze({
	kind: 'significant' as const,
	significant: 6,
	rounding: 'half-up' as const,
});

export const PRESETS = Object.freeze({
	usdLegacy,
	usd,
	usdHalfUp,
	usdSigned: freeze({ ...usd, signDisplay: 'exceptZero' as const }),
	usdCompact: freeze({
		...usd,
		abbreviate: { threshold: '10000' },
	}),
	/** Never show more liability than held, on BOTH signs. */
	balance: freeze({
		style: 'currency' as const,
		digits: {
			kind: 'decimals' as const,
			decimals: 2,
			rounding: 'floor' as const,
		},
	}),
	pnl: freeze({ ...usd, signDisplay: 'exceptZero' as const }),
	percent: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: {
			kind: 'decimals' as const,
			decimals: 2,
			rounding: 'half-up' as const,
		},
	}),
	percentSigned: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: {
			kind: 'decimals' as const,
			decimals: 2,
			rounding: 'half-up' as const,
		},
		signDisplay: 'exceptZero' as const,
	}),
	fundingHourly: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: {
			kind: 'decimals' as const,
			decimals: 5,
			rounding: 'half-up' as const,
		},
	}),
	funding24h: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: {
			kind: 'decimals' as const,
			decimals: 2,
			rounding: 'half-up' as const,
		},
	}),
	/** Requires options.market. Without one the value renders as invalidText. */
	price: freeze({
		digits: { kind: 'tick' as const, rounding: 'half-up' as const },
	}),
	/** Requires options.market. Without one the value renders as invalidText. */
	size: freeze({
		digits: { kind: 'step' as const, rounding: 'truncate' as const },
	}),
	/** The bare prettyPrint() shape formatOrderSize renders today. Needs no market. */
	orderSize: freeze({
		digits: { kind: 'exact' as const },
		trimTrailingZeros: true,
		sentinels: [ENTIRE_POSITION],
	}),
	/**
	 * Step digits from market.sizeDecimals, truncated so a size never rounds up.
	 * Requires options.market; without one the value renders as invalidText.
	 */
	orderSizeStep: freeze({
		digits: { kind: 'step' as const, rounding: 'truncate' as const },
		sentinels: [ENTIRE_POSITION],
	}),
	tradePrecision: freeze({
		digits: {
			kind: 'significant' as const,
			significant: 6,
			rounding: 'truncate' as const,
		},
	}),
	/**
	 * The same six figures rounded rather than truncated, capped at five
	 * decimals so a sub-cent price stops where a trade price stops.
	 * Ungrouped, for a value read back as text.
	 */
	tradePrecisionHalfUp: freeze({
		digits: {
			kind: 'significant' as const,
			significant: 6,
			rounding: 'half-up' as const,
			maxDecimals: 5,
		},
		grouping: false,
	}),
	/** Six significant figures, grouped, with a zero price shown as 0.00. */
	displayPrice: freeze({
		digits: PRICE_DIGITS,
		sentinels: [ZERO_PRICE],
	}),
	/** The same six figures as plain text: ungrouped, trailing zeros dropped. */
	priceText: freeze({
		digits: PRICE_DIGITS,
		trimTrailingZeros: true,
		grouping: false,
	}),
	/**
	 * A base-asset amount: five significant figures, never more than four
	 * decimals, and anything under 0.00001 rendered as a bound rather than as
	 * digits nobody can act on.
	 */
	baseAmount: freeze({
		digits: {
			kind: 'significant' as const,
			significant: 5,
			rounding: 'half-up' as const,
			maxDecimals: 4,
		},
		small: { mode: 'sentinel' as const, sentinelAt: '0.00001' },
	}),
	/**
	 * A wallet balance shown against an earn product. Floored, so it never
	 * offers more than the wallet holds, and ungrouped for a deposit input.
	 */
	earnBalance: freeze({
		digits: {
			kind: 'decimals' as const,
			decimals: 4,
			rounding: 'floor' as const,
		},
		trimTrailingZeros: true,
		grouping: false,
	}),
	/**
	 * Two decimals of an abbreviated mantissa, for balances, volumes and
	 * totals. Below a cent it keeps two significant digits instead, an
	 * unreadable or non-finite value reads as a plain zero, and a missing one
	 * takes the fallback.
	 */
	millifiedAmount: freeze({
		digits: {
			kind: 'decimals' as const,
			decimals: 2,
			rounding: 'half-up' as const,
		},
		abbreviate: {
			threshold: '1000',
			digits: {
				kind: 'decimals' as const,
				decimals: 2,
				rounding: 'half-up' as const,
			},
		},
		small: {
			mode: 'significant' as const,
			minSignificant: 2,
			maxLeadingZeros: 1,
		},
		sentinels: [ZERO_AMOUNT],
		invalidText: '0',
		nonFiniteText: { positive: '0', negative: '0' },
	}),
	/**
	 * Exact digits, except at the two ends: a value with more than three
	 * leading zeros takes the subscript form, and one with seven or more
	 * integer digits abbreviates at six significant figures.
	 */
	specialValue: freeze({
		digits: { kind: 'exact' as const },
		small: { mode: 'subscript' as const },
		abbreviate: {
			minIntegerDigits: 7,
			digits: PRICE_DIGITS,
			trimTrailingZeros: true,
		},
		grouping: false,
	}),
	/**
	 * Zero, a negative and unusable input all read as 1x, because there is no
	 * such thing as less than one times your own equity. A positive value below
	 * a half still rounds to 0x rather than being clamped up.
	 */
	leverage: freeze({
		digits: {
			kind: 'decimals' as const,
			decimals: 0,
			rounding: 'half-up' as const,
		},
		unit: 'x',
		grouping: false,
		sentinels: [NON_POSITIVE_LEVERAGE],
		fallback: '1x',
		invalidText: '1x',
		nonFiniteText: { positive: '∞x', negative: '1x' },
	}),
	compact: freeze({
		digits: { kind: 'exact' as const },
		abbreviate: { threshold: '10000' },
		trimTrailingZeros: true,
	}),
	chartTick: freeze({
		digits: {
			kind: 'significant' as const,
			significant: 3,
			rounding: 'truncate' as const,
		},
		abbreviate: { threshold: '1000' },
		trimTrailingZeros: true,
	}),
	plain: freeze({ digits: { kind: 'exact' as const }, grouping: false }),
	/** Ungrouped, trailing zeros dropped. What BigNum.printShort renders. */
	printShort: freeze({
		digits: { kind: 'exact' as const },
		trimTrailingZeros: true,
		grouping: false,
	}),
	/** Grouped, trailing zeros dropped. What BigNum.prettyPrint renders. */
	prettyPrint: freeze({
		digits: { kind: 'exact' as const },
		trimTrailingZeros: true,
	}),
	/** Always abbreviates at 3 significant figures. What BigNum.toMillified renders. */
	millifyLegacy: freeze({
		grouping: false,
		abbreviate: {
			threshold: 'always' as const,
			fallThrough: false,
			digits: {
				kind: 'significant' as const,
				significant: 3,
				trailingZeros: 'trim' as const,
				rounding: 'truncate' as const,
			},
		},
	}),
});

const NUMBER = freeze({ digits: { kind: 'exact' as const } });
const NUMBER_SIGNED = freeze({
	digits: { kind: 'exact' as const },
	signDisplay: 'exceptZero' as const,
});

/** Runtime resolver, because 6 <NumberDisplay> sites pass `type` as a variable. */
export function optionsForLegacyType(t: LegacyNumberType): FormatOptions {
	switch (t) {
		case 'currency':
			return PRESETS.usd;
		case 'currency_signed':
			return PRESETS.usdSigned;
		case 'percentage':
			return PRESETS.percent;
		case 'percentage_signed':
			return PRESETS.percentSigned;
		case 'number_signed':
			return NUMBER_SIGNED;
		case 'number':
			return NUMBER;
	}
}

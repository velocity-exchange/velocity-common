import { ENTIRE_POSITION } from './sentinels';
import { FormatOptions, LegacyNumberType, SentinelRule } from './types';

const NON_POSITIVE_LEVERAGE: SentinelRule = {
	matches: (v) => v.sign !== 1,
	text: '1x',
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

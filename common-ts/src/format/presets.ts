import { ENTIRE_POSITION, belowThreshold } from './sentinels';
import { FormatOptions, LegacyNumberType } from './types';

const freeze = (o: FormatOptions): FormatOptions => Object.freeze(o);

/**
 * `usd` reproduces today's truncate-toward-zero cent, which is what every
 * BigNum.toNotional call site renders. `usdHalfUp` is the flip target; adopting
 * it is a separate, product-signed-off step.
 */
const usdLegacy = freeze({
	style: 'currency' as const,
	digits: { kind: 'decimals' as const, decimals: 2 },
	rounding: 'truncate' as const,
});

const usdHalfUp = freeze({
	style: 'currency' as const,
	digits: { kind: 'decimals' as const, decimals: 2 },
	rounding: 'half-up' as const,
});

export const PRESETS = Object.freeze({
	usdLegacy,
	usd: usdLegacy,
	usdHalfUp,
	usdSigned: freeze({ ...usdLegacy, signDisplay: 'exceptZero' as const }),
	usdCompact: freeze({
		...usdLegacy,
		abbreviate: { threshold: '10000' },
	}),
	/** Never show more liability than held, on BOTH signs. */
	balance: freeze({
		style: 'currency' as const,
		digits: { kind: 'decimals' as const, decimals: 2 },
		rounding: 'floor' as const,
	}),
	pnl: freeze({ ...usdLegacy, signDisplay: 'exceptZero' as const }),
	percent: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: { kind: 'decimals' as const, decimals: 2 },
		rounding: 'half-up' as const,
	}),
	percentSigned: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: { kind: 'decimals' as const, decimals: 2 },
		rounding: 'half-up' as const,
		signDisplay: 'exceptZero' as const,
	}),
	fundingHourly: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: { kind: 'decimals' as const, decimals: 5 },
		rounding: 'half-up' as const,
	}),
	funding24h: freeze({
		style: 'percent' as const,
		percentScale: 'none' as const,
		digits: { kind: 'decimals' as const, decimals: 2 },
		rounding: 'half-up' as const,
	}),
	price: freeze({
		digits: { kind: 'tick' as const },
		rounding: 'half-up' as const,
	}),
	priceForOrder: freeze({
		digits: { kind: 'tick' as const },
		rounding: 'truncate' as const,
	}),
	size: freeze({
		digits: { kind: 'step' as const },
		rounding: 'truncate' as const,
	}),
	/** formatOrderSize's default formatter is bare prettyPrint(), so this is exact. */
	orderSize: freeze({
		digits: { kind: 'exact' as const },
		trimTrailingZeros: true,
		sentinels: [ENTIRE_POSITION],
	}),
	tradePrecision: freeze({
		digits: { kind: 'significant' as const, significant: 6 },
		rounding: 'truncate' as const,
	}),
	leverage: freeze({
		digits: { kind: 'decimals' as const, decimals: 0 },
		rounding: 'truncate' as const,
		unit: 'x',
		sentinels: [belowThreshold('1', '1x')],
	}),
	compact: freeze({
		digits: { kind: 'exact' as const },
		abbreviate: { threshold: '10000' },
		trimTrailingZeros: true,
	}),
	chartTick: freeze({
		digits: { kind: 'significant' as const, significant: 3 },
		rounding: 'truncate' as const,
		abbreviate: { threshold: '1000' },
		trimTrailingZeros: true,
	}),
	plain: freeze({ digits: { kind: 'exact' as const }, grouping: false }),
});

const NUMBER = Object.freeze({ digits: { kind: 'exact' as const } });
const NUMBER_SIGNED = Object.freeze({
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

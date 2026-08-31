import {
	Decimal,
	DecimalStatus,
	NumericInput,
	RoundingMode,
} from './core/index';
import { LocaleConfig } from './locale';

/**
 * Digit control. Mutually exclusive by construction, so "precision beats
 * decimals" cannot be expressed. `exact` is the DEFAULT and covers the
 * plurality of today's call sites (the bare print()/printShort() path).
 *
 * Every kind that drops digits carries its own `rounding`, so a spec that
 * rounds without saying how is unrepresentable rather than a render-time throw.
 */
export type DigitSpec =
	| { kind: 'exact' }
	| {
			kind: 'decimals';
			decimals: number;
			rounding: RoundingMode;
			minDecimals?: number;
	  }
	| {
			kind: 'significant';
			significant: number;
			rounding: RoundingMode;
			maxDecimals?: number;
			/** Below one only: 'trim' drops padding zeros the source scale carried. */
			trailingZeros?: 'keep' | 'trim';
	  }
	| { kind: 'tick'; rounding: RoundingMode }
	| { kind: 'step'; rounding: RoundingMode }
	/** The NumLib price-magnitude heuristic. Opt-in only, never a default. */
	| {
			kind: 'magnitude';
			assetPrice: NumericInput;
			rounding: RoundingMode;
			maxDecimals?: number;
	  };

export type AbbreviateUnits = 'financial' | 'si';

export interface AbbreviateOptions {
	/** Exact Decimal comparison, never a float compare. Default '10000'. */
	threshold?: NumericInput | 'always';
	units?: AbbreviateUnits;
	digits?: DigitSpec;
	trimTrailingZeros?: boolean;
	/**
	 * Reproduces formatNumber's isAbbreviatedMillifiedValue behaviour: if the
	 * abbreviation did not actually take, fall through and apply the outer
	 * `digits` instead. Default true, because that is today's behaviour.
	 */
	fallThrough?: boolean;
	/** Past the largest unit. 'clamp' lets the mantissa grow (1,234Q). Default 'clamp'. */
	overflow?: 'clamp' | 'full';
	/**
	 * handleSpecialRendering's 'large' branch: abbreviate above N integer digits.
	 * Supersedes `threshold` entirely when set; the two are never combined.
	 */
	minIntegerDigits?: number;
}

export interface SmallNumberOptions {
	mode: 'subscript' | 'significant' | 'sentinel';
	minSignificant?: number;
	/** Engage only past N leading zeros after the point. Default 3. */
	maxLeadingZeros?: number;
	sentinelAt?: NumericInput;
}

export interface SentinelRule {
	/**
	 * Raw units and scale, NOT a resolved Decimal, so a u64::MAX sentinel is
	 * matchable at any precision exponent.
	 */
	matches(v: { units: string; scale: number; sign: -1 | 0 | 1 }): boolean;
	text: string;
}

export type SignDisplay = 'auto' | 'always' | 'exceptZero' | 'never';

export interface MarketPrecision {
	readonly priceDecimals: number;
	readonly sizeDecimals: number;
	readonly tick: Decimal;
	readonly step: Decimal;
	readonly source: 'onchain' | 'clamped';
}

export interface FormatOptions {
	style?: 'plain' | 'currency' | 'percent';
	currencySymbol?: string;
	/**
	 * 'none'  : value is already in percent units. THIS IS THE DEFAULT and it
	 *           matches today's formatNumber, which does not multiply.
	 * 'ratio' : value is 0..1, multiplied by exactly 100 via shiftPoint.
	 */
	percentScale?: 'none' | 'ratio';
	signDisplay?: SignDisplay;
	digits?: DigitSpec;
	/**
	 * 'preserve' renders -$0.00 for a small negative, matching today.
	 * 'suppress' renders $0.00 and reports sign 'zero'.
	 */
	negativeZero?: 'preserve' | 'suppress';
	grouping?: boolean;
	trimTrailingZeros?: boolean;
	locale?: LocaleConfig;
	market?: MarketPrecision;
	abbreviate?: AbbreviateOptions | false;
	small?: SmallNumberOptions | false;
	/** Written straight into parts.unit, with no separating space ('12x'). */
	unit?: string;
	/** Normalised to exactly one leading space (' SOL'). */
	suffix?: string;
	surround?: 'none' | 'parens' | 'parensIfNegative';
	fallback?: string;
	nonFiniteText?: { positive: string; negative: string };
	invalidText?: string;
	sentinels?: readonly SentinelRule[];
}

export interface FormatParts {
	surroundStart: string;
	sign: '' | '-' | '+';
	/** Always AFTER sign, giving '-$12.34'. */
	currency: string;
	integer: string;
	/** '' when there is no fraction. */
	decimalSeparator: string;
	fraction: string;
	unit: string;
	percent: string;
	suffix: string;
	surroundEnd: string;
}

/** Branded, so a formatted string cannot type-check into order math. */
declare const displayBrand: unique symbol;
export type DisplayString = string & { readonly [displayBrand]: true };

export type ValueSign = 'positive' | 'negative' | 'zero' | 'none';

export interface FormatResult {
	readonly text: DisplayString;
	readonly parts: FormatParts;
	/** Computed AFTER rounding, so it always agrees with the rendered digits. */
	readonly sign: ValueSign;
	/** Sign of the untouched input, for callers that need pre-rounding intent. */
	readonly exactSign: ValueSign;
	readonly isZero: boolean;
	readonly status: DecimalStatus;
	readonly isSentinel: boolean;
	readonly wasAbbreviated: boolean;
	readonly abbreviation: { unit: string; exponent: number } | null;
	readonly wasRounded: boolean;
	/**
	 * A nonzero input that digit rounding collapsed to a literal zero. The small
	 * forms never do this by construction, so they report false and signal their
	 * precision loss through wasRounded instead.
	 */
	readonly roundedAway: boolean;
	readonly usedSmallForm: boolean;
	readonly roundingApplied: RoundingMode | null;
	/** The untouched input. The ONLY thing allowed back into math. */
	readonly exact: Decimal | null;
}

export type LegacyNumberType =
	| 'number'
	| 'number_signed'
	| 'currency'
	| 'currency_signed'
	| 'percentage'
	| 'percentage_signed';

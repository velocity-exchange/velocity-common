import {
	Decimal,
	DecimalStatus,
	NumericInput,
	RoundingMode,
	shiftPoint,
	toDecimal,
} from './core/index';
import { abbreviateValue } from './abbreviate';
import { groupInteger } from './grouping';
import { getDefaultLocale } from './locale';
import { applyDigitSpec, minDecimalsOf } from './resolveDigits';
import { applySmallNumber } from './small';
import { trimFractionZeros } from './trim';
import {
	DigitSpec,
	DisplayString,
	FormatOptions,
	FormatParts,
	FormatResult,
	SignDisplay,
	ValueSign,
} from './types';

const EXACT: DigitSpec = { kind: 'exact' };
/** Matches abbreviate's own default, for a fallThrough:false spec with no digits. */
const ABBREVIATE_FALLBACK: DigitSpec = {
	kind: 'significant',
	significant: 3,
	rounding: 'truncate',
};
const DEFAULT_NON_FINITE = { positive: '∞', negative: '-∞' };

function emptyParts(): FormatParts {
	return {
		surroundStart: '',
		sign: '',
		currency: '',
		integer: '',
		decimalSeparator: '',
		fraction: '',
		unit: '',
		percent: '',
		suffix: '',
		surroundEnd: '',
	};
}

function assemble(parts: FormatParts): DisplayString {
	return (parts.surroundStart +
		parts.sign +
		parts.currency +
		parts.integer +
		parts.decimalSeparator +
		parts.fraction +
		parts.unit +
		parts.percent +
		parts.suffix +
		parts.surroundEnd) as DisplayString;
}

function signOf(d: Decimal | null): ValueSign {
	if (!d) return 'none';
	if (d.sign === 1) return 'positive';
	if (d.sign === -1) return 'negative';
	return 'zero';
}

function signChar(sign: ValueSign, display: SignDisplay): '' | '-' | '+' {
	if (display === 'never') return '';
	if (sign === 'negative') return '-';
	if (display === 'always') return sign === 'none' ? '' : '+';
	if (display === 'exceptZero') return sign === 'positive' ? '+' : '';
	return '';
}

function normaliseSuffix(suffix?: string): string {
	if (!suffix) return '';
	const trimmed = suffix.trim();
	return trimmed === '' ? '' : ` ${trimmed}`;
}

function textResult(
	text: string,
	status: DecimalStatus,
	sign: ValueSign,
	exact: Decimal | null,
	isSentinel: boolean
): FormatResult {
	const parts = emptyParts();
	parts.integer = text;
	return {
		text: text as DisplayString,
		parts,
		sign,
		exactSign: signOf(exact),
		isZero: exact ? exact.sign === 0 : false,
		status,
		isSentinel,
		wasAbbreviated: false,
		abbreviation: null,
		wasRounded: false,
		roundedAway: false,
		usedSmallForm: false,
		roundingApplied: null,
		exact,
	};
}

export function formatValue(
	input: NumericInput,
	options: FormatOptions = {}
): FormatResult {
	const parsed = toDecimal(input);

	if (parsed.status === 'nullish') {
		return textResult(options.fallback ?? '-', 'nullish', 'none', null, false);
	}
	if (parsed.status === 'invalid') {
		return textResult(
			options.invalidText ?? '?',
			'invalid',
			'none',
			null,
			false
		);
	}
	if (parsed.status === 'non-finite') {
		const texts = options.nonFiniteText ?? DEFAULT_NON_FINITE;
		const negative = parsed.nonFiniteSign === -1;
		return textResult(
			negative ? texts.negative : texts.positive,
			'non-finite',
			negative ? 'negative' : 'positive',
			null,
			false
		);
	}

	const exact = parsed.value as Decimal;

	for (const rule of options.sentinels ?? []) {
		if (
			rule.matches({
				units: exact.digits,
				scale: exact.scale,
				sign: exact.sign,
			})
		) {
			return textResult(rule.text, 'ok', signOf(exact), exact, true);
		}
	}

	const working =
		options.percentScale === 'ratio' ? shiftPoint(exact, 2) : exact;

	const digits = options.digits ?? EXACT;
	const locale = options.locale ?? getDefaultLocale();

	let integer = '';
	let fraction = '';
	let unit = '';
	let rounded: Decimal = working;
	let wasRounded = false;
	let roundedAway = false;
	let roundingApplied: RoundingMode | null = null;
	let wasAbbreviated = false;
	let abbreviation: { unit: string; exponent: number } | null = null;
	let usedSmallForm = false;
	let trimTrailingZeros = options.trimTrailingZeros ?? false;
	let minDecimals = minDecimalsOf(digits);

	const small = options.small ? applySmallNumber(working, options.small) : null;
	const smallPrefix = small?.prefix ?? '';

	if (small) {
		usedSmallForm = true;
		integer = small.integer;
		fraction = small.fraction;
		rounded = small.value;
		wasRounded = small.wasRounded;
		roundingApplied = small.roundingApplied;
		minDecimals = 0;
		trimTrailingZeros = false;
	} else {
		const abbreviateOptions = options.abbreviate || undefined;
		const abbreviated = abbreviateOptions
			? abbreviateValue(working, abbreviateOptions)
			: null;

		if (abbreviated?.applied) {
			wasAbbreviated = true;
			abbreviation = {
				unit: abbreviated.unit,
				exponent: abbreviated.exponent,
			};
			integer = abbreviated.integer;
			fraction = abbreviated.fraction;
			unit = abbreviated.unit;
			rounded = abbreviated.value;
			wasRounded = abbreviated.wasRounded;
			roundingApplied = abbreviated.roundingApplied;
			minDecimals = 0;
			trimTrailingZeros =
				abbreviateOptions?.trimTrailingZeros ?? trimTrailingZeros;
		} else {
			const keptAbbreviateDigits =
				abbreviateOptions !== undefined &&
				abbreviateOptions.fallThrough === false;
			const spec = keptAbbreviateDigits
				? (abbreviateOptions.digits ?? ABBREVIATE_FALLBACK)
				: digits;
			const resolved = applyDigitSpec(working, spec, options.market);
			if (resolved.status !== 'ok') {
				return textResult(
					options.invalidText ?? '?',
					'invalid',
					'none',
					exact,
					false
				);
			}
			integer = resolved.integer;
			fraction = resolved.fraction;
			rounded = resolved.value;
			wasRounded = resolved.wasRounded;
			roundedAway = resolved.roundedAway;
			roundingApplied = resolved.roundingApplied;
			minDecimals = minDecimalsOf(spec);
		}
	}

	if (trimTrailingZeros) fraction = trimFractionZeros(fraction, minDecimals);
	if (options.grouping !== false) integer = groupInteger(integer, locale);

	const postRoundSign = signOf(rounded);
	const exactSign = signOf(exact);
	// A small-number sentinel renders a positive bound, so its reported sign has
	// to come from the input rather than from the digits on screen.
	const displaySign = smallPrefix
		? exactSign
		: postRoundSign === 'zero' &&
			  (options.negativeZero ?? 'preserve') === 'preserve'
			? exactSign
			: postRoundSign;

	const parts = emptyParts();
	// The small-number sentinel already carries the comparison in its prefix, so
	// the bound it renders never takes a sign of its own.
	parts.sign = smallPrefix
		? ''
		: signChar(displaySign, options.signDisplay ?? 'auto');
	parts.currency =
		options.style === 'currency' ? (options.currencySymbol ?? '$') : '';
	parts.integer = integer;
	parts.decimalSeparator = fraction === '' ? '' : locale.decimal;
	parts.fraction = fraction;
	parts.unit = `${unit}${options.unit ?? ''}`;
	parts.percent = options.style === 'percent' ? '%' : '';
	parts.suffix = normaliseSuffix(options.suffix);
	parts.surroundStart = smallPrefix;
	if (
		options.surround === 'parens' ||
		(options.surround === 'parensIfNegative' && displaySign === 'negative')
	) {
		parts.surroundStart = `(${smallPrefix}`;
		parts.surroundEnd = ')';
	}

	return {
		text: assemble(parts),
		parts,
		sign: displaySign,
		exactSign,
		isZero: rounded.sign === 0,
		status: 'ok',
		isSentinel: false,
		wasAbbreviated,
		abbreviation,
		wasRounded,
		roundedAway,
		usedSmallForm,
		roundingApplied,
		exact,
	};
}

export function formatText(
	input: NumericInput,
	options?: FormatOptions
): DisplayString {
	return formatValue(input, options).text;
}

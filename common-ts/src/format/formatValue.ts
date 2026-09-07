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
import { DECIMAL_SEPARATOR } from './locale';
import { applyDigitSpec, minDecimalsOf } from './resolveDigits';
import { applySmallNumber } from './small';
import { trimDecimalZeros, trimFractionZeros } from './trim';
import {
	DigitSpec,
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

function assemble(parts: FormatParts): string {
	return (
		parts.surroundStart +
		parts.sign +
		parts.currency +
		parts.integer +
		parts.decimalSeparator +
		parts.fraction +
		parts.unit +
		parts.percent +
		parts.suffix +
		parts.surroundEnd
	);
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
		text,
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

	const exact = parsed.value;

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

	const smallOptions = options.small || undefined;
	const smallFirst =
		smallOptions !== undefined &&
		(smallOptions.order ?? 'before-digits') === 'before-digits';

	let small =
		smallOptions && smallFirst ? applySmallNumber(working, smallOptions) : null;

	if (!small) {
		const abbreviateOptions = options.abbreviate || undefined;
		const abbreviated = abbreviateOptions
			? abbreviateValue(working, abbreviateOptions, options.market)
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
			minDecimals = minDecimalsOf(
				abbreviateOptions?.digits ?? ABBREVIATE_FALLBACK
			);
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

		// An abbreviated value is far too large for the small forms, and the
		// mantissa it leaves behind is not the value the check is about.
		if (smallOptions && !smallFirst && !wasAbbreviated) {
			// The trim runs before the check, so a trimmed value takes the small
			// form its trimmed digits describe.
			if (trimTrailingZeros) {
				fraction = trimFractionZeros(fraction, minDecimals);
				rounded = trimDecimalZeros(rounded, minDecimals);
			}
			small = applySmallNumber(rounded, smallOptions);
		}
	}

	if (small) {
		usedSmallForm = true;
		integer = small.integer;
		fraction = small.fraction;
		rounded = small.value;
		wasRounded = wasRounded || small.wasRounded;
		roundingApplied = small.roundingApplied ?? roundingApplied;
		roundedAway = false;
		minDecimals = 0;
		trimTrailingZeros = false;
	}
	const smallPrefix = small?.prefix ?? '';

	if (trimTrailingZeros) fraction = trimFractionZeros(fraction, minDecimals);
	if (options.grouping !== false) integer = groupInteger(integer);

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
	parts.decimalSeparator = fraction === '' ? '' : DECIMAL_SEPARATOR;
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
	};
}

export function formatText(
	input: NumericInput,
	options?: FormatOptions
): string {
	return formatValue(input, options).text;
}

import {
	Decimal,
	RoundingMode,
	abs,
	compare,
	integerDigitCount,
	shiftPoint,
	toDecimal,
} from './core/index';
import { applyDigitSpec } from './resolveDigits';
import {
	AbbreviateOptions,
	AbbreviateUnits,
	DigitSpec,
	MarketPrecision,
} from './types';

const FINANCIAL_UNITS = ['', 'K', 'M', 'B', 'T', 'Q'];
const SI_UNITS = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];

const DEFAULT_THRESHOLD = '10000';
const DEFAULT_DIGITS: DigitSpec = {
	kind: 'significant',
	significant: 3,
	rounding: 'truncate',
};

export interface AbbreviateResult {
	applied: boolean;
	unit: string;
	exponent: number;
	integer: string;
	fraction: string;
	value: Decimal;
	wasRounded: boolean;
	roundingApplied: RoundingMode | null;
}

export function unitTable(units: AbbreviateUnits = 'financial'): string[] {
	return units === 'si' ? SI_UNITS : FINANCIAL_UNITS;
}

function passesThreshold(value: Decimal, options: AbbreviateOptions): boolean {
	if (options.minIntegerDigits !== undefined) {
		return integerDigitCount(abs(value)) >= options.minIntegerDigits;
	}
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	if (threshold === 'always') return true;
	const parsed = toDecimal(threshold);
	// An unusable threshold falls back to the default, never to 'always'.
	const bound =
		parsed.status === 'ok' ? parsed.value : toDecimal(DEFAULT_THRESHOLD).value!;
	return compare(abs(value), bound) >= 0;
}

/**
 * Rounds at abbreviate.digits, then re-derives the unit, so 999,999 at 3sf
 * half-up is 1.00M rather than 1000K. `fullDigits` is the spec that would print
 * the value unabbreviated: a value it rounds up to the threshold abbreviates.
 */
export function abbreviateValue(
	value: Decimal,
	options: AbbreviateOptions,
	market?: MarketPrecision,
	fullDigits?: DigitSpec
): AbbreviateResult {
	const units = unitTable(options.units);
	const maxIndex = units.length - 1;
	const digits = options.digits ?? DEFAULT_DIGITS;

	const notApplied: AbbreviateResult = {
		applied: false,
		unit: '',
		exponent: 0,
		integer: '',
		fraction: '',
		value,
		wasRounded: false,
		roundingApplied: null,
	};

	if (value.sign === 0) return notApplied;

	// Just under the threshold, abbreviate the rounded value the full form
	// would print, so 999.995 at 2dp reads 1.00K rather than 1,000.00.
	let source = value;
	if (!passesThreshold(value, options)) {
		const full = fullDigits && applyDigitSpec(value, fullDigits, market);
		if (full?.status !== 'ok' || !passesThreshold(full.value, options)) {
			return notApplied;
		}
		source = full.value;
	}

	let index = Math.floor((integerDigitCount(abs(source)) - 1) / 3);
	if (index === 0) return notApplied;
	if (index > maxIndex) {
		if (options.overflow === 'full') return notApplied;
		index = maxIndex;
	}

	let resolved = applyDigitSpec(shiftPoint(source, -3 * index), digits, market);
	if (resolved.integer.length > 3 && index < maxIndex) {
		index += 1;
		resolved = applyDigitSpec(shiftPoint(source, -3 * index), digits, market);
	}
	if (resolved.status !== 'ok') return notApplied;

	return {
		applied: true,
		unit: units[index],
		exponent: 3 * index,
		integer: resolved.integer,
		fraction: resolved.fraction,
		value: resolved.value,
		wasRounded: resolved.wasRounded || source !== value,
		roundingApplied: resolved.roundingApplied,
	};
}

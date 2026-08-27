import {
	Decimal,
	abs,
	compare,
	integerDigitCount,
	shiftPoint,
	toDecimal,
} from './core/index';
import { applyDigitSpec } from './resolveDigits';
import { AbbreviateOptions, AbbreviateUnits, DigitSpec } from './types';

const FINANCIAL_UNITS = ['', 'K', 'M', 'B', 'T', 'Q'];
const SI_UNITS = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];

const DEFAULT_THRESHOLD = '10000';
const DEFAULT_DIGITS: DigitSpec = { kind: 'significant', significant: 3 };

export interface AbbreviateResult {
	applied: boolean;
	unit: string;
	exponent: number;
	integer: string;
	fraction: string;
	value: Decimal;
	wasRounded: boolean;
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
		parsed.status === 'ok' && parsed.value
			? parsed.value
			: toDecimal(DEFAULT_THRESHOLD).value!;
	return compare(abs(value), bound) >= 0;
}

/**
 * Rounds at abbreviate.digits, then re-derives the unit, so 999,999 at 3sf
 * half-up is 1.00M rather than 1000K.
 */
export function abbreviateValue(
	value: Decimal,
	options: AbbreviateOptions
): AbbreviateResult {
	const units = unitTable(options.units);
	const maxIndex = units.length - 1;
	const digits = options.digits ?? DEFAULT_DIGITS;
	const rounding = options.rounding ?? 'truncate';

	const notApplied: AbbreviateResult = {
		applied: false,
		unit: '',
		exponent: 0,
		integer: '',
		fraction: '',
		value,
		wasRounded: false,
	};

	if (value.sign === 0 || !passesThreshold(value, options)) return notApplied;

	let index = Math.floor((integerDigitCount(abs(value)) - 1) / 3);
	if (index === 0) return notApplied;
	if (index > maxIndex) {
		if (options.overflow === 'full') return notApplied;
		index = maxIndex;
	}

	let resolved = applyDigitSpec(
		shiftPoint(value, -3 * index),
		digits,
		rounding
	);
	if (resolved.integer.length > 3 && index < maxIndex) {
		index += 1;
		resolved = applyDigitSpec(shiftPoint(value, -3 * index), digits, rounding);
	}
	if (resolved.status !== 'ok') return notApplied;

	return {
		applied: true,
		unit: units[index],
		exponent: 3 * index,
		integer: resolved.integer,
		fraction: resolved.fraction,
		value: resolved.value,
		wasRounded: resolved.wasRounded,
	};
}

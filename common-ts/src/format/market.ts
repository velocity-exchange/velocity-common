import {
	BnLike,
	Decimal,
	NumericInput,
	StepMode,
	abs,
	fractionDigitCount,
	integerDigitCount,
	snapToStep,
	toDecimal,
} from './core/index';
import { DECIMAL_SEPARATOR } from './locale';
import { MarketPrecision } from './types';

function requireDecimal(input: NumericInput, label: string): Decimal {
	const parsed = toDecimal(input);
	if (parsed.status !== 'ok') {
		throw new Error(`${label} must be a finite numeric value`);
	}
	return parsed.value;
}

/**
 * Resolution rule, preserving today's getEffectivePriceDecimals exactly:
 * priceDecimals = min(onchain tick decimals, maxPriceDecimals when supplied).
 * This is an INTERSECTION, never an override, so config can only tighten.
 */
export function marketPrecisionFromSizes(args: {
	tickSize: BnLike;
	tickPrecisionExp: number | BnLike;
	stepSize: BnLike;
	stepPrecisionExp: number | BnLike;
	maxPriceDecimals?: number;
	maxSizeDecimals?: number;
}): MarketPrecision {
	const tick = requireDecimal(
		{ raw: args.tickSize, scale: args.tickPrecisionExp },
		'tickSize'
	);
	const step = requireDecimal(
		{ raw: args.stepSize, scale: args.stepPrecisionExp },
		'stepSize'
	);

	const onchainPriceDecimals = fractionDigitCount(tick);
	const onchainSizeDecimals = fractionDigitCount(step);
	const priceDecimals =
		args.maxPriceDecimals === undefined
			? onchainPriceDecimals
			: Math.min(onchainPriceDecimals, args.maxPriceDecimals);
	const sizeDecimals =
		args.maxSizeDecimals === undefined
			? onchainSizeDecimals
			: Math.min(onchainSizeDecimals, args.maxSizeDecimals);

	return Object.freeze({
		priceDecimals,
		sizeDecimals,
		tick,
		step,
		source:
			priceDecimals === onchainPriceDecimals &&
			sizeDecimals === onchainSizeDecimals
				? ('onchain' as const)
				: ('clamped' as const),
	});
}

/**
 * The NumLib price-magnitude heuristic: enough size decimals that the display
 * implies about one cent of accuracy. Kept, demoted to opt-in.
 */
export function sizeDecimalsFromPrice(
	assetPrice: NumericInput,
	opts?: { max?: number }
): number {
	const max = opts?.max ?? 6;
	const parsed = toDecimal(assetPrice);
	if (parsed.status !== 'ok' || parsed.value.sign === 0) return max;
	const exponent = integerDigitCount(abs(parsed.value)) - 1;
	return Math.min(exponent + 2, max);
}

export function snapValueToStep(
	value: NumericInput,
	step: NumericInput,
	mode: StepMode = 'toward-zero'
): Decimal | null {
	const parsedValue = toDecimal(value);
	const parsedStep = toDecimal(step);
	if (parsedValue.status !== 'ok') return null;
	if (parsedStep.status !== 'ok') return null;
	if (parsedStep.value.sign !== 1) return null;
	return snapToStep(parsedValue.value, parsedStep.value, mode);
}

/**
 * The typing path. Truncates to `maxFractionDigits`, preserving an in-progress
 * trailing separator so it is safe on every keystroke, except at zero fraction
 * digits where no separator is ever valid. The digit count comes from the
 * caller (an on-chain step Decimal), not from a JS literal's stringification,
 * which turns 1e-7 into zero decimals today.
 */
export function capStringFractionDigits(
	input: string,
	cfg: { maxFractionDigits: number }
): string {
	if (typeof input !== 'string' || input === '') return input;
	const separatorIndex = input.lastIndexOf(DECIMAL_SEPARATOR);
	if (separatorIndex === -1) return input;

	const head = input.slice(0, separatorIndex) || '0';
	const fraction = input.slice(separatorIndex + DECIMAL_SEPARATOR.length);
	// At zero fraction digits the separator itself is never valid, so it goes on
	// both an in-progress '5.' and a complete '5.7'.
	if (cfg.maxFractionDigits === 0) return head;
	if (fraction.length <= cfg.maxFractionDigits) return input;
	return `${head}${DECIMAL_SEPARATOR}${fraction.slice(
		0,
		cfg.maxFractionDigits
	)}`;
}

/** Fraction digits a step allows, for feeding capStringFractionDigits. */
export function stepFractionDigits(step: NumericInput): number {
	const parsed = toDecimal(step);
	if (parsed.status !== 'ok') return 0;
	return fractionDigitCount(parsed.value);
}

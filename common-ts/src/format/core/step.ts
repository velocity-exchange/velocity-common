import { fromParts } from './construct';
import { zeros } from './digits';
import { roundToDecimals } from './round';
import { Decimal, StepMode } from './types';

// BigInt literals need target ES2020; this package targets ES2019.
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TWO = BigInt(2);

function alignedUnits(d: Decimal, scale: number): bigint {
	const magnitude = BigInt(d.digits + zeros(scale - d.scale));
	return d.sign === -1 ? -magnitude : magnitude;
}

function toDecimalFromUnits(units: bigint, scale: number): Decimal {
	if (units === BIG_ZERO) return fromParts(0, '0', scale);
	const negative = units < BIG_ZERO;
	const magnitude = negative ? -units : units;
	return fromParts(negative ? -1 : 1, magnitude.toString(), scale);
}

function stepUnits(
	value: Decimal,
	step: Decimal
): { scale: number; value: bigint; step: bigint; stepScale: number } {
	if (step.sign === 0) throw new Error('Step size must be non-zero');
	const magnitude = fromParts(1, step.digits, step.scale);
	const scale = Math.max(value.scale, magnitude.scale);
	return {
		scale,
		value: alignedUnits(value, scale),
		step: alignedUnits(magnitude, scale),
		stepScale: magnitude.scale,
	};
}

/**
 * Exact lattice snap. Uses BigInt for the one integer division. The result is
 * emitted at the step's scale, which always holds it exactly.
 */
export function snapToStep(
	value: Decimal,
	step: Decimal,
	mode: StepMode
): Decimal {
	const aligned = stepUnits(value, step);
	const quotient = aligned.value / aligned.step;
	const remainder = aligned.value % aligned.step;
	const stepMagnitude = BigInt(step.digits);

	if (remainder === BIG_ZERO) {
		return toDecimalFromUnits(quotient * stepMagnitude, aligned.stepScale);
	}

	let adjusted = quotient;
	switch (mode) {
		case 'toward-zero':
			break;
		case 'floor':
			if (aligned.value < BIG_ZERO) adjusted -= BIG_ONE;
			break;
		case 'ceil':
			if (aligned.value > BIG_ZERO) adjusted += BIG_ONE;
			break;
		case 'nearest': {
			const doubled = (remainder < BIG_ZERO ? -remainder : remainder) * BIG_TWO;
			if (doubled >= aligned.step) {
				adjusted += aligned.value < BIG_ZERO ? -BIG_ONE : BIG_ONE;
			}
			break;
		}
	}
	return toDecimalFromUnits(adjusted * stepMagnitude, aligned.stepScale);
}

export function isStepMultiple(value: Decimal, step: Decimal): boolean {
	const aligned = stepUnits(value, step);
	return aligned.value % aligned.step === BIG_ZERO;
}

/**
 * NOT the same operation as snapToStep. Truncates to N fraction digits.
 * This is what the input path does today and it must stay a separate function.
 */
export function capFractionDigits(
	value: Decimal,
	maxFractionDigits: number
): Decimal {
	if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
		throw new Error(
			`maxFractionDigits must be a non-negative integer, got ${maxFractionDigits}`
		);
	}
	if (value.scale <= maxFractionDigits) return value;
	return roundToDecimals(value, maxFractionDigits, 'truncate');
}

import { BigNum, BN } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import {
	getBigNumRoundedToStepSize,
	roundBigNumToDecimalPlace,
} from '../../src/utils/math/bignum';
import {
	dividesExactly,
	numbersFitEvenly,
	roundToStepSize,
	roundToStepSizeIfLargeEnough,
	truncateInputToPrecision,
} from '../../src/utils/math/precision';
import { isExactMultiple } from '../../src/format/index';
import { getDecimalsFromSize } from '../../src/utils/markets/precisions';
import { trimTrailingZeros } from '../../src/utils/strings/format';
import { CorpusCase, Divergence, runCorpus } from '../format/divergence';

/**
 * Characterization corpus for the precision delegates. Each `legacy*`
 * function below is the implementation as it stood before the delegation, kept
 * here as the oracle: the delegate must reproduce it over the whole corpus
 * except at the cases listed in that function's diff table, and every entry in
 * a diff table names the behaviour it is there for.
 */

// ---------------------------------------------------------------------------
// roundBigNumToDecimalPlace
// ---------------------------------------------------------------------------

const legacyRoundBigNumToDecimalPlace = (
	bignum: BigNum,
	decimalPlaces: number
) => {
	const factor = Math.pow(10, decimalPlaces);
	const newNum = Math.round(bignum.toNum() * factor) / factor;
	return BigNum.fromPrint(newNum.toString(), bignum.precision);
};

const ROUND_VALUES = [
	'0',
	'1',
	'-1',
	'1.5',
	'-1.5',
	'2.5',
	'-2.5',
	'0.5',
	'-0.5',
	'0.005',
	'-0.005',
	'1.005',
	'0.1',
	'0.29',
	'-0.29',
	'1.2345678',
	'-1.2345678',
	'0.0000001',
	'-0.0000001',
	'0.000000001',
	'1e-9',
	'0.049999999',
	'9.999999',
	'-9.999999',
	'123456789.123456789',
	'-123456789.123456789',
	'999999999999.999999999',
	'12345678901234.5',
];

describe('roundBigNumToDecimalPlace delegates to roundToDecimals half-ceil', () => {
	const cases: CorpusCase[] = [];
	for (const value of ROUND_VALUES) {
		for (const decimalPlaces of [0, 1, 2, 6, 9]) {
			for (const precision of [6, 9]) {
				const key = `${value} @${decimalPlaces}dp p${precision}`;
				const bigNum = () => BigNum.fromPrint(value, new BN(precision));
				cases.push({
					key,
					legacy: () =>
						legacyRoundBigNumToDecimalPlace(bigNum(), decimalPlaces).print(),
					next: () =>
						roundBigNumToDecimalPlace(bigNum(), decimalPlaces).print(),
				});
			}
		}
	}

	for (const decimalPlaces of [1.5, -0.5]) {
		const key = `1.5 @${decimalPlaces}dp p6`;
		const bigNum = () => BigNum.fromPrint('1.5', new BN(6));
		cases.push({
			key,
			legacy: () =>
				legacyRoundBigNumToDecimalPlace(bigNum(), decimalPlaces).print(),
			next: () => roundBigNumToDecimalPlace(bigNum(), decimalPlaces).print(),
		});
	}

	// Half-ceil keeps the tie rule `Math.round` had, so every remaining entry is
	// an intended fix: the old implementation routed the value through
	// `toNum()`, so it inherited the double's faults.
	const REPRESENTATION =
		'a value the double cannot hold no longer rounds off the wrong neighbour';
	const HIGH_PRECISION =
		'digits beyond 2^53 survive instead of being re-rounded';

	const FRACTIONAL_PLACES =
		'a non-integer decimalPlaces throws instead of returning float noise, since Math.pow(10, 1.5) is not a power of ten';

	const divergences: Record<string, Divergence> = {
		'1.5 @1.5dp p6': {
			behaviour: FRACTIONAL_PLACES,
			old: '1.486270',
			next: 'THROWS: decimalPlaces must be an integer, got 1.5',
		},
		'1.5 @-0.5dp p6': {
			behaviour: FRACTIONAL_PLACES,
			old: '0.000000',
			next: 'THROWS: decimalPlaces must be an integer, got -0.5',
		},
		'1.005 @2dp p6': {
			behaviour: REPRESENTATION,
			old: '1.000000',
			next: '1.010000',
		},
		'1.005 @2dp p9': {
			behaviour: REPRESENTATION,
			old: '1.000000000',
			next: '1.010000000',
		},
		'123456789.123456789 @9dp p9': {
			behaviour: HIGH_PRECISION,
			old: '123456789.123456790',
			next: '123456789.123456789',
		},
		'-123456789.123456789 @9dp p9': {
			behaviour: HIGH_PRECISION,
			old: '-123456789.123456790',
			next: '-123456789.123456789',
		},
		'999999999999.999999999 @6dp p6': {
			behaviour: HIGH_PRECISION,
			old: '1000000000000.000000',
			next: '999999999999.999999',
		},
		'999999999999.999999999 @9dp p6': {
			behaviour: HIGH_PRECISION,
			old: '1000000000000.000000',
			next: '999999999999.999999',
		},
		'999999999999.999999999 @9dp p9': {
			behaviour: HIGH_PRECISION,
			old: '1000000000000.000000000',
			next: '999999999999.999999999',
		},
	};

	it('reproduces the float implementation except at the annotated fixes', () => {
		runCorpus(cases, divergences);
	});

	it('keeps ties going toward +Infinity, matching the float implementation', () => {
		const half = BigNum.fromPrint('-1.5', new BN(6));
		expect(legacyRoundBigNumToDecimalPlace(half, 0).print()).to.equal(
			'-1.000000'
		);
		expect(roundBigNumToDecimalPlace(half, 0).print()).to.equal('-1.000000');
	});

	it(REPRESENTATION, () => {
		const value = BigNum.fromPrint('1.005', new BN(6));
		expect(legacyRoundBigNumToDecimalPlace(value, 2).print()).to.equal(
			'1.000000'
		);
		expect(roundBigNumToDecimalPlace(value, 2).print()).to.equal('1.010000');
	});

	it(HIGH_PRECISION, () => {
		const value = BigNum.fromPrint('123456789.123456789', new BN(9));
		expect(legacyRoundBigNumToDecimalPlace(value, 9).print()).to.equal(
			'123456789.123456790'
		);
		expect(roundBigNumToDecimalPlace(value, 9).print()).to.equal(
			'123456789.123456789'
		);
	});

	it('still rounds to tens and hundreds on a negative decimal place count', () => {
		expect(
			roundBigNumToDecimalPlace(BigNum.fromPrint('15', new BN(6)), -1).print()
		).to.equal('20.000000');
		expect(
			roundBigNumToDecimalPlace(
				BigNum.fromPrint('123.456', new BN(3)),
				-1
			).print()
		).to.equal('120.000');
	});
});

// ---------------------------------------------------------------------------
// getBigNumRoundedToStepSize
// ---------------------------------------------------------------------------

const legacyGetBigNumRoundedToStepSize = (baseSize: BigNum, stepSize: BN) =>
	baseSize.div(stepSize).mul(stepSize);

describe('getBigNumRoundedToStepSize delegates to snapValueToStep toward-zero', () => {
	const cases: CorpusCase[] = [];
	for (const value of [
		'0',
		'1',
		'-1',
		'0.1',
		'1.23456789',
		'-1.23456789',
		'5.1',
		'-5.1',
		'0.0000001',
		'-0.0000001',
		'999999999.999999999',
		'-999999999.999999999',
	]) {
		for (const precision of [6, 9]) {
			for (const step of ['1', '3', '7', '10', '1000', '100000', '1000000']) {
				const key = `${value} p${precision} step ${step}`;
				const bigNum = () => BigNum.fromPrint(value, new BN(precision));
				cases.push({
					key,
					legacy: () =>
						legacyGetBigNumRoundedToStepSize(bigNum(), new BN(step)).print(),
					next: () =>
						getBigNumRoundedToStepSize(bigNum(), new BN(step)).print(),
				});
			}
		}
	}

	// A negative precision exponent has no fixed-point scale to print at, so
	// these compare the raw units and the exponent the result carries.
	const rawUnits = (bigNum: BigNum) =>
		`${bigNum.val.toString()} p${bigNum.precision.toString()}`;
	for (const precision of [-1, -2, -6]) {
		for (const raw of ['0', '1', '1234', '1500000', '18446744073709551615']) {
			for (const step of ['1', '3', '10', '25', '1000']) {
				const key = `raw ${raw} p${precision} step ${step}`;
				const bigNum = () => BigNum.from(new BN(raw), new BN(precision));
				cases.push({
					key,
					legacy: () =>
						rawUnits(legacyGetBigNumRoundedToStepSize(bigNum(), new BN(step))),
					next: () =>
						rawUnits(getBigNumRoundedToStepSize(bigNum(), new BN(step))),
				});
			}
		}
	}

	cases.push({
		key: '1.5 p6 step -10',
		legacy: () =>
			legacyGetBigNumRoundedToStepSize(
				BigNum.fromPrint('1.5', new BN(6)),
				new BN(-10)
			).print(),
		next: () =>
			getBigNumRoundedToStepSize(
				BigNum.fromPrint('1.5', new BN(6)),
				new BN(-10)
			).print(),
	});

	it('reproduces the BN division except at the annotated divergence', () => {
		runCorpus(cases, {
			'1.5 p6 step -10': {
				behaviour:
					'a negative step is invalid input and now fails loudly, where two sign flips used to cancel and return the value unchanged',
				old: '1.500000',
				next: 'THROWS: Cannot snap 1500000 to step -10',
			},
		});
	});

	it('still refuses a zero step, with a named error instead of a BN assertion', () => {
		const value = BigNum.fromPrint('1.5', new BN(6));
		expect(() => legacyGetBigNumRoundedToStepSize(value, new BN(0))).to.throw();
		expect(() => getBigNumRoundedToStepSize(value, new BN(0))).to.throw(
			/Cannot snap/
		);
	});
});

// ---------------------------------------------------------------------------
// truncateInputToPrecision / roundToStepSize / roundToStepSizeIfLargeEnough
// ---------------------------------------------------------------------------

const legacyTruncateInputToPrecision = (input: string, exp: BN) => {
	const decimalPlaces = input.split('.')[1]?.length ?? 0;
	const maxDecimals = exp.toNumber();
	if (decimalPlaces > maxDecimals) {
		return input.slice(0, input.length - (decimalPlaces - maxDecimals));
	}
	return input;
};

const legacyRoundToStepSize = (value: string, stepSize?: number) => {
	const stepSizeExp = stepSize?.toString().split('.')[1]?.length ?? 0;
	const truncated = legacyTruncateInputToPrecision(value, new BN(stepSizeExp));
	if (truncated.charAt(truncated.length - 1) === '.')
		return truncated.slice(0, -1);
	return truncated;
};

const legacyRoundToStepSizeIfLargeEnough = (
	value: string,
	stepSize?: number
) => {
	const parsedValue = parseFloat(value);
	if (isNaN(parsedValue) || stepSize === 0 || !value || parsedValue === 0) {
		return value;
	}
	return legacyRoundToStepSize(value, stepSize);
};

const INPUT_CORPUS = [
	'',
	'abc',
	'0',
	'0.0',
	'1',
	'1.0',
	'1.',
	'.5',
	'-.5',
	'.12345',
	'00.1230',
	'1.2345678',
	'-1.2345678',
	'0.0000001',
	'-0.0000001',
	'1e-7',
	'1,234.5678',
	'1.2.3',
	'1.2.345',
	'.1.23456',
	'123456789012345.123456789',
];

const STEP_CORPUS: Array<number | undefined> = [
	undefined,
	0,
	1,
	2,
	10,
	100,
	0.5,
	0.1,
	0.01,
	0.001,
	1e-6,
	1e-7,
	1e-9,
	1.5e-7,
	0.30000000000000004,
	1e21,
];

// Neither shape can come from the input path's own keystrokes; both are here
// because the old and new code disagree on them, so the disagreement is pinned
// rather than left to be discovered by a caller.
const MULTI_SEPARATOR =
	'input holding more than one separator counts its fraction digits after the last one, not the first, so a cap can now bite where it used to pass';
const NON_STRING =
	'a non-string value passes through untouched instead of throwing on `.split`, because the delegate type-checks its input first';

const separatorFix = (old: string, next: string): Divergence => ({
	behaviour: MULTI_SEPARATOR,
	old,
	next,
});

describe('truncateInputToPrecision delegates to capStringFractionDigits', () => {
	const cases: CorpusCase[] = [];
	for (const input of INPUT_CORPUS) {
		for (const exp of [0, 1, 2, 6, 9]) {
			cases.push({
				key: `${JSON.stringify(input)} exp ${exp}`,
				legacy: () => legacyTruncateInputToPrecision(input, new BN(exp)),
				next: () => truncateInputToPrecision(input, new BN(exp)),
			});
		}
	}
	cases.push({
		key: 'non-string 5 exp 6',
		legacy: () =>
			legacyTruncateInputToPrecision(5 as unknown as string, new BN(6)),
		next: () =>
			String(truncateInputToPrecision(5 as unknown as string, new BN(6))),
	});

	it('reproduces the slice implementation except at the annotated divergences', () => {
		runCorpus(cases, {
			// A single trailing separator is back to the old shape: the head now
			// comes from the last separator, the same one the core split on.
			'"1.2.345" exp 0': separatorFix('1.2.34', '1.2.'),
			'"1.2.345" exp 1': separatorFix('1.2.345', '1.2.3'),
			'"1.2.345" exp 2': separatorFix('1.2.345', '1.2.34'),
			'".1.23456" exp 0': separatorFix('.1.2345', '.1.'),
			'".1.23456" exp 1': separatorFix('.1.23456', '.1.2'),
			'".1.23456" exp 2': separatorFix('.1.23456', '.1.23'),
			'non-string 5 exp 6': {
				behaviour: NON_STRING,
				old: 'THROWS: input.split is not a function',
				next: '5',
			},
		});
	});

	it('keeps the in-progress shapes the input path types through', () => {
		expect(truncateInputToPrecision('1.', new BN(6))).to.equal('1.');
		expect(truncateInputToPrecision('.5', new BN(6))).to.equal('.5');
		expect(truncateInputToPrecision('.12345', new BN(2))).to.equal('.12');
		expect(truncateInputToPrecision('1.23', new BN(0))).to.equal('1.');
	});

	it('keeps the old head on multi-separator input', () => {
		expect(legacyTruncateInputToPrecision('1.2.3', new BN(0))).to.equal('1.2.');
		expect(truncateInputToPrecision('1.2.3', new BN(0))).to.equal('1.2.');
	});
});

// The whole point of the delegation: `(1e-7).toString()` is '1e-7', which has
// no '.', so the old digit count was 0 and every fraction digit was cut.
const EXPONENTIAL_STEP =
	'a step below 1e-6, which `Number.prototype.toString` renders exponentially, reports its real decimals instead of zero, so typed fraction digits survive';

const exponentialFix = (old: string, next: string): Divergence => ({
	behaviour: EXPONENTIAL_STEP,
	old,
	next,
});

const STEP_SIZE_DIVERGENCES: Record<string, Divergence> = {
	'"0.0" step 1e-7': exponentialFix('0', '0.0'),
	'"0.0" step 1e-9': exponentialFix('0', '0.0'),
	'"1.0" step 1e-7': exponentialFix('1', '1.0'),
	'"1.0" step 1e-9': exponentialFix('1', '1.0'),
	'".5" step 1e-7': exponentialFix('', '.5'),
	'".5" step 1e-9': exponentialFix('', '.5'),
	'"-.5" step 1e-7': exponentialFix('-', '-.5'),
	'"-.5" step 1e-9': exponentialFix('-', '-.5'),
	'".12345" step 1e-7': exponentialFix('', '.12345'),
	'".12345" step 1e-9': exponentialFix('', '.12345'),
	'".12345" step 1.5e-7': exponentialFix('.1234', '.12345'),
	'"00.1230" step 1e-7': exponentialFix('00', '00.1230'),
	'"00.1230" step 1e-9': exponentialFix('00', '00.1230'),
	'"1.2345678" step 1e-7': exponentialFix('1', '1.2345678'),
	'"1.2345678" step 1e-9': exponentialFix('1', '1.2345678'),
	'"1.2345678" step 1.5e-7': exponentialFix('1.2345', '1.2345678'),
	'"-1.2345678" step 1e-7': exponentialFix('-1', '-1.2345678'),
	'"-1.2345678" step 1e-9': exponentialFix('-1', '-1.2345678'),
	'"-1.2345678" step 1.5e-7': exponentialFix('-1.2345', '-1.2345678'),
	'"0.0000001" step 1e-7': exponentialFix('0', '0.0000001'),
	'"0.0000001" step 1e-9': exponentialFix('0', '0.0000001'),
	'"0.0000001" step 1.5e-7': exponentialFix('0.0000', '0.0000001'),
	'"-0.0000001" step 1e-7': exponentialFix('-0', '-0.0000001'),
	'"-0.0000001" step 1e-9': exponentialFix('-0', '-0.0000001'),
	'"-0.0000001" step 1.5e-7': exponentialFix('-0.0000', '-0.0000001'),
	'"1,234.5678" step 1e-7': exponentialFix('1,234', '1,234.5678'),
	'"1,234.5678" step 1e-9': exponentialFix('1,234', '1,234.5678'),
	// Multi-separator input at an exponential step: the digit count, not the
	// head, is what moved, so these belong to the same fix.
	'"1.2.3" step 1e-7': exponentialFix('1.2', '1.2.3'),
	'"1.2.3" step 1e-9': exponentialFix('1.2', '1.2.3'),
	'"1.2.345" step 1e-7': exponentialFix('1.2.34', '1.2.345'),
	'"1.2.345" step 1e-9': exponentialFix('1.2.34', '1.2.345'),
	'".1.23456" step 1e-7': exponentialFix('.1.2345', '.1.23456'),
	'".1.23456" step 1e-9': exponentialFix('.1.2345', '.1.23456'),
	'"123456789012345.123456789" step 1e-7': exponentialFix(
		'123456789012345',
		'123456789012345.1234567'
	),
	'"123456789012345.123456789" step 1e-9': exponentialFix(
		'123456789012345',
		'123456789012345.123456789'
	),
	'"123456789012345.123456789" step 1.5e-7': exponentialFix(
		'123456789012345.1234',
		'123456789012345.12345678'
	),
	// '1.2.3' is absent from here on: at every plainly stringified step it now
	// reproduces the old output exactly.
	'"1.2.345" step undefined': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 0': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 1': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 2': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 10': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 100': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 1e+21': separatorFix('1.2.34', '1.2'),
	'"1.2.345" step 0.5': separatorFix('1.2.345', '1.2.3'),
	'"1.2.345" step 0.1': separatorFix('1.2.345', '1.2.3'),
	'"1.2.345" step 0.01': separatorFix('1.2.345', '1.2.34'),
	'".1.23456" step undefined': separatorFix('.1.2345', '.1'),
	'".1.23456" step 0': separatorFix('.1.2345', '.1'),
	'".1.23456" step 1': separatorFix('.1.2345', '.1'),
	'".1.23456" step 2': separatorFix('.1.2345', '.1'),
	'".1.23456" step 10': separatorFix('.1.2345', '.1'),
	'".1.23456" step 100': separatorFix('.1.2345', '.1'),
	'".1.23456" step 1e+21': separatorFix('.1.2345', '.1'),
	'".1.23456" step 0.5': separatorFix('.1.23456', '.1.2'),
	'".1.23456" step 0.1': separatorFix('.1.23456', '.1.2'),
	'".1.23456" step 0.01': separatorFix('.1.23456', '.1.23'),
	'".1.23456" step 0.001': separatorFix('.1.23456', '.1.234'),
};

describe('roundToStepSize delegates to capStringFractionDigits with an exact step', () => {
	const cases: CorpusCase[] = [];
	for (const input of INPUT_CORPUS) {
		for (const step of STEP_CORPUS) {
			cases.push({
				key: `${JSON.stringify(input)} step ${step}`,
				legacy: () => legacyRoundToStepSize(input, step),
				next: () => roundToStepSize(input, step),
			});
		}
	}

	it('reproduces the slice implementation except at the annotated fixes', () => {
		runCorpus(cases, STEP_SIZE_DIVERGENCES);
	});

	it('keeps the fraction digits of a step that stringifies exponentially', () => {
		expect(legacyRoundToStepSize('1.2345678', 1e-7)).to.equal('1');
		expect(roundToStepSize('1.2345678', 1e-7)).to.equal('1.2345678');
		expect(legacyRoundToStepSize('1.2345678', 1e-9)).to.equal('1');
		expect(roundToStepSize('1.2345678', 1e-9)).to.equal('1.2345678');
	});

	it('leaves every step that stringifies plainly untouched', () => {
		expect(roundToStepSize('1.2345678', 1e-6)).to.equal('1.234567');
		expect(roundToStepSize('1.2345678', 0.01)).to.equal('1.23');
		expect(roundToStepSize('1.2345678', 1)).to.equal('1');
		expect(roundToStepSize('1.2345678', 100)).to.equal('1');
	});
});

describe('roundToStepSizeIfLargeEnough keeps its guard and inherits the step fix', () => {
	const cases: CorpusCase[] = [];
	for (const input of INPUT_CORPUS) {
		for (const step of STEP_CORPUS) {
			cases.push({
				key: `${JSON.stringify(input)} step ${step}`,
				legacy: () => legacyRoundToStepSizeIfLargeEnough(input, step),
				next: () => roundToStepSizeIfLargeEnough(input, step),
			});
		}
	}

	// '0' and '0.0' short-circuit on the parsedValue === 0 guard, '' on the
	// falsy-value guard and 'abc' on the NaN guard, and a zero step returns the
	// value untouched, so none of those reach roundToStepSize at all.
	const GUARDED_INPUTS = ['', 'abc', '0', '0.0'];
	const divergences: Record<string, Divergence> = {};
	for (const [key, divergence] of Object.entries(STEP_SIZE_DIVERGENCES)) {
		const [rawInput, rawStep] = key.split('" step ');
		if (GUARDED_INPUTS.includes(rawInput.slice(1))) continue;
		if (Number(rawStep) === 0) continue;
		divergences[key] = divergence;
	}

	it('reproduces the guard exactly and only differs where roundToStepSize does', () => {
		runCorpus(cases, divergences);
	});

	it('returns the value untouched wherever the guard fires', () => {
		expect(roundToStepSizeIfLargeEnough('0.0', 1e-7)).to.equal('0.0');
		expect(roundToStepSizeIfLargeEnough('1.2.345', 0)).to.equal('1.2.345');
		expect(roundToStepSizeIfLargeEnough('abc', 1e-7)).to.equal('abc');
	});
});

// ---------------------------------------------------------------------------
// getDecimalsFromSize
// ---------------------------------------------------------------------------

const legacyGetDecimalsFromSize = (size: BN, precisionExp: BN) => {
	const formattedSize = BigNum.from(size, precisionExp).prettyPrint();
	if (formattedSize.includes('.')) {
		return formattedSize.split('.')[1].length;
	}
	return 0;
};

describe('getDecimalsFromSize delegates to stepFractionDigits', () => {
	it('reproduces the prettyPrint digit count over every size and exponent', () => {
		const cases: CorpusCase[] = [];
		for (const raw of [
			'0',
			'1',
			'10',
			'100',
			'1000',
			'100000',
			'1000000',
			'10000000',
			'1000000000',
			'123456789',
			'-1',
			'-1000',
			'999999999999999999',
		]) {
			for (const exp of [0, 2, 6, 9, 10]) {
				cases.push({
					key: `${raw} exp ${exp}`,
					legacy: () =>
						String(legacyGetDecimalsFromSize(new BN(raw), new BN(exp))),
					next: () => String(getDecimalsFromSize(new BN(raw), new BN(exp))),
				});
			}
		}
		cases.push({
			key: '1000 exp -2',
			legacy: () => String(legacyGetDecimalsFromSize(new BN(1000), new BN(-2))),
			next: () => String(getDecimalsFromSize(new BN(1000), new BN(-2))),
		});
		runCorpus(cases, {
			'1000 exp -2': {
				behaviour:
					'a negative precision exponent yields zero decimals instead of throwing inside prettyPrint',
				old: 'THROWS: Tried to print a BN with precision lower than zero',
				next: '0',
			},
		});
	});

	it('no longer depends on the module-global BigNum.delim', () => {
		const size = new BN(1000);
		const precisionExp = new BN(6);
		const originalDelim = BigNum.delim;
		try {
			BigNum.delim = ',';
			expect(legacyGetDecimalsFromSize(size, precisionExp)).to.equal(0);
			expect(getDecimalsFromSize(size, precisionExp)).to.equal(3);
		} finally {
			BigNum.delim = originalDelim;
		}
	});
});

// ---------------------------------------------------------------------------
// trimTrailingZeros
// ---------------------------------------------------------------------------

const legacyTrimTrailingZeros = (str: string, zerosToShow = 1) => {
	if (!str.includes('.')) return str;
	const sides = str.split('.');
	sides[1] = sides[1].replace(/0+$/, '');
	if (sides[1].length < zerosToShow) {
		const zerosToAdd = zerosToShow - sides[1].length;
		sides[1] = `${sides[1]}${Array(zerosToAdd).fill('0').join('')}`;
	}
	if (sides[1].length === 0) return sides[0];
	return sides.join('.');
};

describe('trimTrailingZeros delegates to the core trimmer', () => {
	it('reproduces the zerosToShow semantics over the corpus', () => {
		const cases: CorpusCase[] = [];
		for (const str of [
			'1',
			'1.',
			'1.1',
			'1.0000',
			'1.1000',
			'1.1200',
			'1.0010',
			'0',
			'0.0',
			'0.000',
			'-0.000',
			'-1.2300',
			'.000',
			'1.2.000',
			'123456789012345.100000000',
			'-0.000000001',
		]) {
			for (const zerosToShow of [0, 1, 2, 3, 9]) {
				cases.push({
					key: `${JSON.stringify(str)} z${zerosToShow}`,
					legacy: () => legacyTrimTrailingZeros(str, zerosToShow),
					next: () => trimTrailingZeros(str, zerosToShow),
				});
			}
		}
		cases.push({
			key: '"1.000" z1.5',
			legacy: () => legacyTrimTrailingZeros('1.000', 1.5),
			next: () => trimTrailingZeros('1.000', 1.5),
		});
		runCorpus(cases, {
			'"1.000" z1.5': {
				behaviour:
					'a fractional zerosToShow pads down to the whole number of zeros instead of throwing on Array(1.5)',
				old: 'THROWS: Invalid array length',
				next: '1.0',
			},
		});
	});

	it('keeps the default of one surviving zero', () => {
		expect(trimTrailingZeros('1.0000')).to.equal('1.0');
		expect(legacyTrimTrailingZeros('1.0000')).to.equal('1.0');
	});
});

// ---------------------------------------------------------------------------
// numbersFitEvenly / dividesExactly stay tolerant; isExactMultiple is the exact one
// ---------------------------------------------------------------------------

describe('the tolerant multiple checks keep their tolerance', () => {
	it('numbersFitEvenly still accepts a float quotient within 1e-9 of an integer', () => {
		expect(numbersFitEvenly(5.1, 0.1)).to.equal(true);
		expect(5.1 / 0.1).to.equal(50.99999999999999);
		expect(numbersFitEvenly(5, 2)).to.equal(false);
		expect(numbersFitEvenly(0, 7)).to.equal(true);
		expect(numbersFitEvenly(7, 0)).to.equal(true);
	});

	it('dividesExactly still accepts a remainder within 1e-6 of one', () => {
		expect(dividesExactly(5.1, 0.1)).to.equal(true);
		expect(dividesExactly(0.3, 0.1)).to.equal(true);
		expect(dividesExactly(5, 2)).to.equal(false);
	});

	// isExactMultiple itself is covered in tests/format/market.test.ts, beside
	// the rest of the format layer. This only pins where it disagrees.
	it('the exact replacement disagrees where the tolerance was doing work', () => {
		expect(numbersFitEvenly(7, 0)).to.equal(true);
		expect(isExactMultiple(7, 0)).to.equal(false);
		expect(dividesExactly(0.9999999, 1)).to.equal(true);
		expect(isExactMultiple('0.9999999', '1')).to.equal(false);
	});
});

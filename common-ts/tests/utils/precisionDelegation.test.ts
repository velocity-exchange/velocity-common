import { BigNum, BN } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import {
	getBigNumRoundedToStepSize,
	roundBigNumToDecimalPlace,
} from '../../src/utils/math/bignum';
import {
	dividesExactly,
	numbersFitEvenly,
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

	// Half-ceil keeps the tie rule `Math.round` had, so every remaining entry is
	// an intended fix: the old implementation routed the value through
	// `toNum()`, so it inherited the double's faults.
	const REPRESENTATION =
		'a value the double cannot hold no longer rounds off the wrong neighbour';
	const HIGH_PRECISION =
		'digits beyond 2^53 survive instead of being re-rounded';

	const divergences: Record<string, Divergence> = {
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

	it('rejects a non-integer decimal place count instead of returning float noise', () => {
		const value = BigNum.fromPrint('1.5', new BN(6));
		expect(() => roundBigNumToDecimalPlace(value, 1.5)).to.throw(
			/must be an integer/
		);
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

	it('reproduces the BN division exactly, with no annotated divergences', () => {
		runCorpus(cases, {});
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

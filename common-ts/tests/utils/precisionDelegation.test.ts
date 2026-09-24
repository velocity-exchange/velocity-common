import { BigNum, BN } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { roundBigNumToDecimalPlace } from '../../src/utils/math/bignum';
import { dividesExactly } from '../../src/utils/math/precision';
import { isExactMultiple } from '../../src/format/index';
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
// dividesExactly stays tolerant; isExactMultiple is the exact one. It keeps
// one internal caller (orderbook bucket rounding) that needs the tolerance.
// ---------------------------------------------------------------------------

describe('dividesExactly keeps its tolerance', () => {
	it('still accepts a remainder within 1e-6 of one', () => {
		expect(dividesExactly(5.1, 0.1)).to.equal(true);
		expect(dividesExactly(0.3, 0.1)).to.equal(true);
		expect(dividesExactly(5, 2)).to.equal(false);
	});

	// isExactMultiple itself is covered in tests/format/market.test.ts, beside
	// the rest of the format layer. This only pins where it disagrees.
	it('the exact replacement disagrees where the tolerance was doing work', () => {
		expect(dividesExactly(0.9999999, 1)).to.equal(true);
		expect(isExactMultiple('0.9999999', '1')).to.equal(false);
	});
});

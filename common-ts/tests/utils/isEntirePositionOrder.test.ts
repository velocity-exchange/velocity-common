import { BigNum, MAX_LEVERAGE_ORDER_SIZE } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { PRESETS, formatValue } from '../../src/format/index';
import { isEntirePositionOrder } from '../../src/utils/trading';

/**
 * The pre-delegation rule: within one display unit of MAX_LEVERAGE_ORDER_SIZE
 * or of the truncated marker. Kept here as the oracle for the behaviour-change
 * table below; the tolerance grows with precision, unlike the sentinel's fixed
 * raw window.
 */
const legacyIsEntirePositionOrder = (orderAmount: BigNum): boolean => {
	const maxLeverageSize = new BigNum(
		MAX_LEVERAGE_ORDER_SIZE,
		orderAmount.precision
	);
	const isMaxLeverage = Math.abs(maxLeverageSize.sub(orderAmount).toNum()) < 1;

	const ALTERNATIVE_MAX_ORDER_SIZE = '18446744072000000000';
	const alternativeMaxSize = new BigNum(
		ALTERNATIVE_MAX_ORDER_SIZE,
		orderAmount.precision
	);
	const isAlternativeMax =
		Math.abs(alternativeMaxSize.sub(orderAmount).toNum()) < 1;

	return isMaxLeverage || isAlternativeMax;
};

describe('isEntirePositionOrder', () => {
	const MAX = BigInt('18446744073709551615');
	const ONE = BigInt(1);
	const FIVE_E12 = BigInt('5000000000000');

	const roundedToStep = (step: bigint) => (MAX - (MAX % step)).toString();

	// [label, raw units below/above u64::MAX, as a string]
	const RAW_CASES: [string, string][] = [
		['u64::MAX', MAX.toString()],
		['truncated marker', '18446744072000000000'],
		['step 1e6', roundedToStep(BigInt(1_000_000))],
		['step 1e9', roundedToStep(BigInt(1_000_000_000))],
		['step 1e10', roundedToStep(BigInt(10_000_000_000))],
		['step 1e12-1', roundedToStep(BigInt('999999999999'))],
		['step 1e12', roundedToStep(BigInt('1000000000000'))],
		['one above u64::MAX', (MAX + ONE).toString()],
		['5e12 below u64::MAX', (MAX - FIVE_E12).toString()],
		['ordinary size', '12345600000'],
		['zero', '0'],
	];

	const PRECISIONS = [6, 9, 13];

	const amount = (units: string, precision: number) =>
		new BigNum(units, precision);

	describe('agrees with formatValue(x, PRESETS.orderSize).isSentinel', () => {
		for (const [label, units] of RAW_CASES) {
			for (const precision of PRECISIONS) {
				const signs = units === '0' ? [units] : [units, `-${units}`];
				for (const signed of signs) {
					const suffix = signed.startsWith('-') ? ' (negative)' : '';
					it(`${label}${suffix} at precision ${precision}`, () => {
						const bn = amount(signed, precision);
						expect(isEntirePositionOrder(bn)).to.equal(
							formatValue(bn, PRESETS.orderSize).isSentinel
						);
					});
				}
			}
		}
	});

	describe('behaviour changes from the pre-delegation tolerance rule', () => {
		// [label, raw units, precision, before (legacy tolerance), after (sentinel window)]
		const STEP_1E9 = roundedToStep(BigInt(1_000_000_000));
		const STEP_1E10 = roundedToStep(BigInt(10_000_000_000));
		const STEP_1E12_MINUS_1 = roundedToStep(BigInt('999999999999'));
		const STEP_1E12 = roundedToStep(BigInt('1000000000000'));
		const ONE_ABOVE_MAX = (MAX + ONE).toString();
		const FIVE_E12_BELOW_MAX = (MAX - FIVE_E12).toString();

		const CHANGED: [string, string, number, boolean, boolean][] = [
			['step 1e9, precision 6', STEP_1E9, 6, false, true],
			['step 1e10, precision 6', STEP_1E10, 6, false, true],
			['step 1e10, precision 9', STEP_1E10, 9, false, true],
			['step 1e12-1, precision 6', STEP_1E12_MINUS_1, 6, false, true],
			['step 1e12-1, precision 9', STEP_1E12_MINUS_1, 9, false, true],
			['step 1e12, precision 6', STEP_1E12, 6, false, true],
			['step 1e12, precision 9', STEP_1E12, 9, false, true],
			['one above u64::MAX, precision 6', ONE_ABOVE_MAX, 6, true, false],
			['one above u64::MAX, precision 9', ONE_ABOVE_MAX, 9, true, false],
			['one above u64::MAX, precision 13', ONE_ABOVE_MAX, 13, true, false],
			[
				'5e12 below u64::MAX, precision 13',
				FIVE_E12_BELOW_MAX,
				13,
				true,
				false,
			],
		];

		for (const [label, units, precision, before, after] of CHANGED) {
			it(`${label}: was ${before}, is now ${after}`, () => {
				const bn = amount(units, precision);
				expect(legacyIsEntirePositionOrder(bn), 'before').to.equal(before);
				expect(isEntirePositionOrder(bn), 'after').to.equal(after);
			});
		}
	});
});

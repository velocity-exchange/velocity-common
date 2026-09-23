import { expect } from 'chai';
import { BN, SpotMarketConfig } from '@velocity-exchange/sdk';
import { formatTokenInputCurried } from '../../src/utils/validation/input';

/**
 * The pre-fix implementation, kept only so the tests below can compare against
 * it directly. It round-trips through a float via toFixed/Number, which is the
 * float re-entry this task removes.
 */
function legacyFormatTokenInput(
	newAmount: string,
	precisionExp: number
): string | undefined {
	if (isNaN(+newAmount)) return undefined;
	if (newAmount === '') return '';
	const lastChar = newAmount[newAmount.length - 1];
	if (lastChar === '.') return newAmount;
	if (lastChar === '0') {
		const numOfDigitsAfterDecimal = newAmount.split('.')[1]?.length ?? 0;
		return numOfDigitsAfterDecimal > precisionExp
			? newAmount.slice(0, -1)
			: newAmount;
	}
	return Number((+newAmount).toFixed(precisionExp)).toString();
}

const marketConfig = (precisionExp: number): SpotMarketConfig =>
	({ precisionExp: new BN(precisionExp) }) as unknown as SpotMarketConfig;

/** Runs the curried setter and returns what it passed, or undefined if it never called it. */
function run(newAmount: string, precisionExp: number): string | undefined {
	let captured: string | undefined;
	formatTokenInputCurried((amount) => {
		captured = amount;
	}, marketConfig(precisionExp))(newAmount);
	return captured;
}

function prefixesOf(amount: string): string[] {
	const out: string[] = [];
	for (let i = 1; i <= amount.length; i++) out.push(amount.slice(0, i));
	return out;
}

/**
 * Every prefix where the new output intentionally disagrees with the legacy
 * one, keyed by `${prefix}|${precisionExp}`. Every disagreement here is an
 * instance of one rule: typed input truncates to precision and never rounds
 * up, and an exponent form expands to plain digits instead of a re-sliced
 * exponent string.
 */
const DIVERGENCES: Record<string, string> = {
	'0.1234567|6': '0.123456',
	'0.12345678|6': '0.123456',
	'0.123456789|6': '0.123456',
	'1.2345678|6': '1.234567',
	'1.23456789|6': '1.234567',
	'0.00000005|6': '0.000000',
	'1.23456789e-1|6': '0.123456',
	'1.23456789e-10|6': '0.000000',
	'0.00000005|9': '0.00000005',
	'1.23456789e-10|9': '0.000000000',
};

const REALISTIC_AMOUNTS = [
	'1234.567891',
	'0.123456789',
	'10.500',
	'1000000',
	'0.00000005',
	'1.23456789e-10',
	'1e5',
];

describe('formatTokenInputCurried', () => {
	for (const precisionExp of [6, 9]) {
		describe(`precisionExp ${precisionExp}`, () => {
			for (const amount of REALISTIC_AMOUNTS) {
				for (const prefix of prefixesOf(amount)) {
					const key = `${prefix}|${precisionExp}`;
					const expected = DIVERGENCES[key];

					if (expected !== undefined) {
						it(`diverges from the float round-trip for ${JSON.stringify(prefix)}`, () => {
							const legacy = legacyFormatTokenInput(prefix, precisionExp);
							expect(run(prefix, precisionExp)).to.equal(expected);
							expect(expected).to.not.equal(legacy);
						});
					} else {
						it(`matches the legacy output for ${JSON.stringify(prefix)}`, () => {
							expect(run(prefix, precisionExp)).to.equal(
								legacyFormatTokenInput(prefix, precisionExp)
							);
						});
					}
				}
			}
		});
	}

	it('normalises exponent-form input instead of re-slicing an exponential string', () => {
		expect(run('1.23456789e-10', 6)).to.not.equal('1.23456789e-1');
		expect(run('1.23456789e-10', 9)).to.not.equal('1.23456789e-1');
	});

	it('truncates typed input past precision rather than rounding it up', () => {
		expect(run('1.2345675', 6)).to.equal('1.234567');
	});

	it('keeps a very small amount in plain notation rather than exponential', () => {
		expect(run('0.00000005', 9)).to.equal('0.00000005');
	});

	it('expands a 1e5-style entry to plain digits, unchanged', () => {
		expect(run('1e5', 6)).to.equal('100000');
		expect(run('1e5', 9)).to.equal('100000');
	});

	it('clears the field on an empty string', () => {
		expect(run('', 6)).to.equal('');
	});

	it('leaves an in-progress trailing separator alone', () => {
		expect(run('12.', 6)).to.equal('12.');
		expect(run('0.', 9)).to.equal('0.');
	});

	it('keeps a typed trailing zero within precision', () => {
		expect(run('1.20', 6)).to.equal('1.20');
		expect(run('10.500', 9)).to.equal('10.500');
	});

	it('ignores unparsable input, leaving the field as-is', () => {
		expect(run('abc', 6)).to.equal(undefined);
		expect(run('-', 6)).to.equal(undefined);
	});
});

import { expect } from 'chai';
import { BN, BigNum } from '@velocity-exchange/sdk';
import { toBigNum } from '../../src/format/adapters/bigNum';
import { parseInput } from '../../src/format/index';
import { Decimal, fromString } from '../../src/format/core/index';
import { makeRandom } from './random';

const SEED = 20260909;
const CASES = 400;

function decimal(text: string): Decimal {
	const parsed = fromString(text);
	expect(parsed.status, text).to.equal('ok');
	return parsed.value!;
}

function typed(text: string, precisionExp: number): Decimal {
	const parsed = parseInput(text, precisionExp);
	expect(parsed.status, text).to.equal('ok');
	return parsed.value!;
}

/** What BigNum.fromPrint reads: units, precision, and the printed form. */
function shape(value: BigNum): [string, string, string] {
	return [value.val.toString(), value.precision.toString(), value.print()];
}

describe('format/toBigNum', () => {
	it('carries the requested precision', () => {
		for (const precisionExp of [0, 1, 6, 9, 18]) {
			const converted = toBigNum(typed('1', precisionExp), precisionExp);
			expect(converted.precision.toNumber(), `@${precisionExp}`).to.equal(
				precisionExp
			);
		}
	});

	it('sends every zero to an unsigned zero', () => {
		for (const text of ['0', '-0', '0.000000', '-0.000000']) {
			const converted = toBigNum(typed(text, 6), 6);
			expect(converted.val.toString(), text).to.equal('0');
			expect(converted.isNeg(), text).to.equal(false);
			expect(converted.print(), text).to.equal(BigNum.zero(6).print());
		}
	});

	it('keeps the smallest representable value at quote precision', () => {
		expect(shape(toBigNum(typed('0.000001', 6), 6))).to.deep.equal([
			'1',
			'6',
			'0.000001',
		]);
	});

	it('keeps every digit of a full quote-precision value', () => {
		expect(shape(toBigNum(typed('123456789.123456', 6), 6))).to.deep.equal([
			'123456789123456',
			'6',
			'123456789.123456',
		]);
	});

	it('keeps 24 integer digits', () => {
		const text = '123456789012345678901234';
		expect(toBigNum(typed(text, 0), 0).print()).to.equal(text);
		expect(toBigNum(typed(text, 9), 9).val.toString()).to.equal(
			`${text}000000000`
		);
	});

	it('keeps u64 max as the units at base precision', () => {
		const converted = toBigNum(typed('18446744073.709551615', 9), 9);
		expect(shape(converted)).to.deep.equal([
			'18446744073709551615',
			'9',
			'18446744073.709551615',
		]);
	});

	it('round-trips negatives at every precision in use', () => {
		const cases: [string, number][] = [
			['-7', 0],
			['-0.00001', 5],
			['-123.456789', 6],
			['-0.00000001', 8],
			['-18446744073.709551615', 9],
		];
		for (const [text, precisionExp] of cases) {
			const converted = toBigNum(typed(text, precisionExp), precisionExp);
			expect(converted.isNeg(), text).to.equal(true);
			expect(converted.print(), text).to.equal(
				BigNum.fromPrint(text, new BN(precisionExp)).print()
			);
		}
	});

	it('scales up by padding zeros', () => {
		expect(shape(toBigNum(decimal('1.5'), 6))).to.deep.equal([
			'1500000',
			'6',
			'1.500000',
		]);
		expect(shape(toBigNum(decimal('-1.5'), 9))).to.deep.equal([
			'-1500000000',
			'9',
			'-1.500000000',
		]);
		expect(shape(toBigNum(decimal('0'), 9))).to.deep.equal([
			'0',
			'9',
			'0.000000000',
		]);
	});

	it('scales down only where every dropped digit is a zero', () => {
		expect(shape(toBigNum(decimal('1.500000'), 2))).to.deep.equal([
			'150',
			'2',
			'1.50',
		]);
		expect(() => toBigNum(decimal('0.001'), 2)).to.throw(/lose digits/);
		expect(() => toBigNum(decimal('-123.456789'), 6)).to.not.throw();
		expect(() => toBigNum(decimal('-123.456789'), 5)).to.throw(/lose digits/);
	});

	it('rejects a precision that is not a digit count', () => {
		for (const precisionExp of [-1, 1.5, NaN]) {
			expect(
				() => toBigNum(decimal('1.5'), precisionExp),
				`@${precisionExp}`
			).to.throw(/non-negative integer/);
		}
	});

	it('matches BigNum.fromPrint of the same text over a random corpus', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const precisionExp = Math.floor(random() * 10);
			const text = randomCanonical(random, precisionExp);
			const converted = toBigNum(typed(text, precisionExp), precisionExp);
			const legacy = BigNum.fromPrint(text, new BN(precisionExp));
			expect(converted.print(), text).to.equal(legacy.print());
			expect(converted.val.toString(), text).to.equal(legacy.val.toString());
		}
	});
});

/** A plain decimal string with no more fraction digits than the precision holds. */
function randomCanonical(random: () => number, precisionExp: number): string {
	const integerDigits = 1 + Math.floor(random() * 24);
	let integer = String(Math.floor(random() * 10));
	for (let i = 1; i < integerDigits; i++) {
		integer += String(Math.floor(random() * 10));
	}
	integer = integer.replace(/^0+(?=[0-9])/, '');
	const fractionDigits = Math.floor(random() * (precisionExp + 1));
	let fraction = '';
	for (let i = 0; i < fractionDigits; i++) {
		fraction += String(Math.floor(random() * 10));
	}
	const sign = random() < 0.5 ? '-' : '';
	return fraction === ''
		? `${sign}${integer}`
		: `${sign}${integer}.${fraction}`;
}

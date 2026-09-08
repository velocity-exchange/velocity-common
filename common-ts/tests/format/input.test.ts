import { expect } from 'chai';
import {
	DIGIT_CAPS,
	InputFieldKind,
	inputFieldConfig,
	marketPrecisionFromSizes,
	parseInput,
} from '../../src/format/index';
import { BN } from '@velocity-exchange/sdk';
import { toPlainString } from '../../src/format/core/index';

const QUOTE_EXP = 6;
const BASE_EXP = 9;

/** A cent tick and a milli-unit step, the shape of a live perp market. */
const market = marketPrecisionFromSizes({
	tickSize: new BN(10_000),
	tickPrecisionExp: QUOTE_EXP,
	stepSize: new BN(1_000_000),
	stepPrecisionExp: BASE_EXP,
});

const parsed = (input: string, precisionExp: number) => {
	const result = parseInput(input, precisionExp);
	expect(result.status, input).to.equal('ok');
	return toPlainString(result.value!);
};

describe('format/input digit caps', () => {
	it('reproduces the caps the inputs hardcode today', () => {
		expect(DIGIT_CAPS.default).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 10,
		});
		expect(DIGIT_CAPS.orderCount).to.deep.equal({
			maxIntegerDigits: 2,
			maxFractionDigits: 10,
		});
		expect(DIGIT_CAPS.slippage).to.deep.equal({
			maxIntegerDigits: 3,
			maxFractionDigits: 6,
		});
	});

	it('caps notional at quote precision and leverage at two decimals', () => {
		expect(DIGIT_CAPS.notional).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 6,
		});
		expect(DIGIT_CAPS.leverage).to.deep.equal({
			maxIntegerDigits: 3,
			maxFractionDigits: 2,
		});
	});

	it('is frozen, so one field cannot retune another', () => {
		expect(Object.isFrozen(DIGIT_CAPS)).to.equal(true);
		expect(Object.isFrozen(DIGIT_CAPS.default)).to.equal(true);
	});
});

describe('format/inputFieldConfig', () => {
	const tableKinds = [
		'default',
		'notional',
		'slippage',
		'orderCount',
		'leverage',
	] as const;

	it('returns the table caps and no market lattice for every table kind', () => {
		for (const kind of tableKinds) {
			const config = inputFieldConfig(kind);
			expect(config.localeTag, kind).to.equal('en-US');
			expect(config.caps, kind).to.deep.equal(DIGIT_CAPS[kind]);
			expect(config.step, kind).to.equal(undefined);
			expect(config.precisionExp, kind).to.equal(undefined);
		}
	});

	it('ignores a market for a kind whose digits do not come from one', () => {
		for (const kind of tableKinds) {
			const config = inputFieldConfig(kind, { market });
			expect(config.caps, kind).to.deep.equal(DIGIT_CAPS[kind]);
			expect(config.step, kind).to.equal(undefined);
			expect(config.precisionExp, kind).to.equal(undefined);
		}
	});

	it('always reports the en-US tag, for every kind', () => {
		const kinds: InputFieldKind[] = [...tableKinds, 'price', 'size'];
		for (const kind of kinds) {
			expect(inputFieldConfig(kind, { market }).localeTag).to.equal('en-US');
		}
	});

	it('derives the price caps, step and precision exponent from the tick', () => {
		const config = inputFieldConfig('price', { market });
		expect(config.caps).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 2,
		});
		expect(toPlainString(config.step!)).to.equal('0.010000');
		expect(config.precisionExp).to.equal(QUOTE_EXP);
	});

	it('derives the size caps, step and precision exponent from the step', () => {
		const config = inputFieldConfig('size', { market });
		expect(config.caps).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 3,
		});
		expect(toPlainString(config.step!)).to.equal('0.001000000');
		expect(config.precisionExp).to.equal(BASE_EXP);
	});

	it('falls back to the default caps when no market is available yet', () => {
		for (const kind of ['price', 'size'] as const) {
			const config = inputFieldConfig(kind);
			expect(config.caps, kind).to.deep.equal(DIGIT_CAPS.default);
			expect(config.step, kind).to.equal(undefined);
			expect(config.precisionExp, kind).to.equal(undefined);
		}
	});

	it('keeps the full digit count of a step below 1e-6', () => {
		const fine = marketPrecisionFromSizes({
			tickSize: new BN(1),
			tickPrecisionExp: QUOTE_EXP,
			stepSize: new BN(100),
			stepPrecisionExp: BASE_EXP,
		});
		expect(inputFieldConfig('price', { market: fine }).caps).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 6,
		});
		const size = inputFieldConfig('size', { market: fine });
		expect(size.caps.maxFractionDigits).to.equal(7);
		expect(toPlainString(size.step!)).to.equal('0.000000100');
		expect(size.precisionExp).to.equal(BASE_EXP);
	});

	it('reports zero fraction digits for a whole-unit step', () => {
		const whole = marketPrecisionFromSizes({
			tickSize: new BN(1_000_000),
			tickPrecisionExp: QUOTE_EXP,
			stepSize: new BN(1_000_000_000),
			stepPrecisionExp: BASE_EXP,
		});
		const config = inputFieldConfig('size', { market: whole });
		expect(config.caps.maxFractionDigits).to.equal(0);
		expect(config.precisionExp).to.equal(BASE_EXP);
		expect(inputFieldConfig('price', { market: whole }).caps).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 0,
		});
	});

	it('lets an override win over the table', () => {
		const config = inputFieldConfig('slippage', {
			overrides: { maxFractionDigits: 2 },
		});
		expect(config.caps).to.deep.equal({
			maxIntegerDigits: 3,
			maxFractionDigits: 2,
		});
	});

	it('lets an override win over the market', () => {
		const config = inputFieldConfig('price', {
			market,
			overrides: { maxIntegerDigits: 6, maxFractionDigits: 8 },
		});
		expect(config.caps).to.deep.equal({
			maxIntegerDigits: 6,
			maxFractionDigits: 8,
		});
		expect(config.precisionExp).to.equal(QUOTE_EXP);
	});

	it('does not hand out the table object itself', () => {
		const config = inputFieldConfig('default');
		config.caps.maxFractionDigits = 1;
		expect(DIGIT_CAPS.default.maxFractionDigits).to.equal(10);
	});
});

describe('format/parseInput', () => {
	it('reads an empty or half-typed field as nullish', () => {
		for (const input of ['', '   ', '-', '+', '.', '-.', ' . ']) {
			const result = parseInput(input, 6);
			expect(result.status, JSON.stringify(input)).to.equal('nullish');
			expect(result.value, JSON.stringify(input)).to.equal(null);
		}
	});

	it('accepts a grouped string, because the mask emits one', () => {
		expect(parsed('1,234.5', 2)).to.equal('1234.50');
		expect(parsed('1,234,567', 0)).to.equal('1234567');
		expect(parsed('-1,000.25', 2)).to.equal('-1000.25');
	});

	// Separators are stripped, not validated, so a half-retyped field parses.
	it('does not police where the group separators sit', () => {
		expect(parsed('1,2,3', 0)).to.equal('123');
		expect(parsed('1,', 0)).to.equal('1');
	});

	it('accepts an in-progress trailing separator and a leading one', () => {
		expect(parsed('12.', 2)).to.equal('12.00');
		expect(parsed('.5', 2)).to.equal('0.50');
		expect(parsed('-.5', 2)).to.equal('-0.50');
	});

	it('keeps the sign, and reads -0 as zero', () => {
		expect(parsed('-1.5', 2)).to.equal('-1.50');
		const zero = parseInput('-0', 2);
		expect(zero.status).to.equal('ok');
		expect(toPlainString(zero.value!)).to.equal('0.00');
	});

	it('expands exponent forms exactly', () => {
		expect(parsed('1e-9', 9)).to.equal('0.000000001');
		expect(parsed('2.95e-7', 9)).to.equal('0.000000295');
		expect(parsed('1e+21', 0)).to.equal('1000000000000000000000');
		expect(parsed('1E3', 2)).to.equal('1000.00');
	});

	it('truncates toward zero past the precision exponent', () => {
		expect(parsed('1.23456789', 4)).to.equal('1.2345');
		expect(parsed('-1.23456789', 4)).to.equal('-1.2345');
		expect(parsed('0.99999', 2)).to.equal('0.99');
		expect(parsed('-0.0000001', 2)).to.equal('0.00');
	});

	it('leaves the digit caps to the mask and never clamps a value', () => {
		expect(parsed('123456789012345678901234567890', 0)).to.equal(
			'123456789012345678901234567890'
		);
		expect(parsed('999.999999', 6)).to.equal('999.999999');
	});

	it('always returns a value at exactly the requested scale', () => {
		for (const exp of [0, 2, 6, 9]) {
			const result = parseInput('7.5', exp);
			expect(result.status).to.equal('ok');
			const fraction = toPlainString(result.value!).split('.')[1] ?? '';
			expect(fraction.length, `scale ${exp}`).to.equal(exp);
		}
	});

	it('gives an infinity its own status, and the sign with it', () => {
		const positive = parseInput('Infinity', 6);
		expect(positive.status).to.equal('non-finite');
		expect(
			positive.status === 'non-finite' ? positive.nonFiniteSign : null
		).to.equal(1);
		const negative = parseInput('-Infinity', 6);
		expect(negative.status).to.equal('non-finite');
		expect(
			negative.status === 'non-finite' ? negative.nonFiniteSign : null
		).to.equal(-1);
	});

	it('rejects text that is not a number', () => {
		for (const input of ['NaN', 'abc', '1 000', '1.2.3', '--1', '0x10', '1e']) {
			const result = parseInput(input, 6);
			expect(result.status, input).to.equal('invalid');
			expect(result.value, input).to.equal(null);
		}
	});

	it('rejects a precision exponent that is not a digit count', () => {
		for (const exp of [-1, 1.5, NaN, 10_001]) {
			expect(parseInput('1.5', exp).status, String(exp)).to.equal('invalid');
		}
	});

	it('parses what inputFieldConfig says the field submits', () => {
		const price = inputFieldConfig('price', { market });
		expect(parsed('1,234.567', price.precisionExp!)).to.equal('1234.567000');
		const size = inputFieldConfig('size', { market });
		expect(parsed('0.0019999', size.precisionExp!)).to.equal('0.001999900');
	});
});

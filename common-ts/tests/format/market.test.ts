import { expect } from 'chai';
import {
	BASE_PRECISION_EXP,
	BN,
	PerpMarketAccount,
	QUOTE_PRECISION_EXP,
} from '@velocity-exchange/sdk';
import {
	DIGIT_CAPS,
	capStringFractionDigits,
	formatText,
	inputFieldConfig,
	marketPrecisionFromSizes,
	parseInput,
	sizeDecimalsFromPrice,
	snapValueToStep,
	stepFractionDigits,
} from '../../src/format/index';
import { fromString, toPlainString } from '../../src/format/core/index';
import { marketPrecisionFromAccount } from '../../src/format/adapters/sdk';
import { EN_US, setDefaultLocale } from '../../src/format/locale';
import { localeFromTag, setNumberLocale } from '../../src/format/intl';

const d = (s: string) => fromString(s).value!;

describe('format/market precision', () => {
	const sizes = {
		tickSize: new BN(100),
		tickPrecisionExp: 6,
		stepSize: new BN(1000000),
		stepPrecisionExp: 9,
	};

	it('derives decimals from the on-chain sizes', () => {
		const precision = marketPrecisionFromSizes(sizes);
		expect(precision.priceDecimals).to.equal(4);
		expect(precision.sizeDecimals).to.equal(3);
		expect(toPlainString(precision.tick)).to.equal('0.000100');
		expect(precision.source).to.equal('onchain');
	});

	it('config may only tighten, never loosen', () => {
		expect(
			marketPrecisionFromSizes({ ...sizes, maxPriceDecimals: 2 }).priceDecimals
		).to.equal(2);
		expect(
			marketPrecisionFromSizes({ ...sizes, maxPriceDecimals: 8 }).priceDecimals
		).to.equal(4);
		expect(
			marketPrecisionFromSizes({ ...sizes, maxPriceDecimals: 2 }).source
		).to.equal('clamped');
	});

	it('handles a step that stringifies exponentially', () => {
		const precision = marketPrecisionFromSizes({
			...sizes,
			stepSize: new BN(100),
			stepPrecisionExp: 9,
		});
		expect(precision.sizeDecimals).to.equal(7);
		expect(stepFractionDigits(precision.step)).to.equal(7);
	});

	it('pins the precision exponents the type-only adapter hardcodes', () => {
		expect(BASE_PRECISION_EXP.toNumber()).to.equal(9);
		expect(QUOTE_PRECISION_EXP.toNumber()).to.equal(6);
	});

	it('reads a market account through the type-only adapter', () => {
		const account = {
			orderTickSize: new BN(100),
			orderStepSize: new BN(1000000),
		} as PerpMarketAccount;
		const precision = marketPrecisionFromAccount(account);
		expect(precision.priceDecimals).to.equal(4);
		expect(precision.sizeDecimals).to.equal(3);
	});

	it('the price-magnitude heuristic survives as opt-in', () => {
		expect(sizeDecimalsFromPrice('30000')).to.equal(6);
		expect(sizeDecimalsFromPrice('5')).to.equal(2);
		expect(sizeDecimalsFromPrice('0.5')).to.equal(2);
		expect(sizeDecimalsFromPrice('0')).to.equal(6);
		expect(sizeDecimalsFromPrice(null)).to.equal(6);
		expect(sizeDecimalsFromPrice('-5')).to.equal(2);
		expect(sizeDecimalsFromPrice('30000', { max: 4 })).to.equal(4);
	});
});

describe('format/step helpers', () => {
	it('snapValueToStep defaults to toward-zero, matching bn.js division', () => {
		expect(toPlainString(snapValueToStep('1.237', '0.01')!)).to.equal('1.23');
		expect(toPlainString(snapValueToStep('-1.237', '0.01')!)).to.equal('-1.23');
		expect(toPlainString(snapValueToStep('-1.237', '0.01', 'floor')!)).to.equal(
			'-1.24'
		);
	});

	it('snapValueToStep returns null rather than throwing on bad input', () => {
		expect(snapValueToStep(null, '0.01')).to.equal(null);
		expect(snapValueToStep('1', '0')).to.equal(null);
		expect(snapValueToStep('1', 'nope')).to.equal(null);
		// A negative step used to snap to the same lattice as its magnitude.
		expect(snapValueToStep('1', '-0.1')).to.equal(null);
		expect(snapValueToStep('1', '-0.1', 'nearest')).to.equal(null);
	});

	it('capStringFractionDigits truncates and keeps an in-progress separator', () => {
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: 2 })
		).to.equal('1.23');
		expect(capStringFractionDigits('1.', { maxFractionDigits: 2 })).to.equal(
			'1.'
		);
		expect(capStringFractionDigits('1.2', { maxFractionDigits: 4 })).to.equal(
			'1.2'
		);
		expect(capStringFractionDigits('1234', { maxFractionDigits: 2 })).to.equal(
			'1234'
		);
		expect(capStringFractionDigits('1.99', { maxFractionDigits: 0 })).to.equal(
			'1'
		);
	});

	it('capStringFractionDigits keeps the integer when the head is empty', () => {
		expect(capStringFractionDigits('.5', { maxFractionDigits: 0 })).to.equal(
			'0'
		);
		expect(capStringFractionDigits('.567', { maxFractionDigits: 2 })).to.equal(
			'0.56'
		);
	});

	it('capStringFractionDigits drops the separator at zero fraction digits', () => {
		expect(capStringFractionDigits('5.', { maxFractionDigits: 0 })).to.equal(
			'5'
		);
		expect(capStringFractionDigits('5.7', { maxFractionDigits: 0 })).to.equal(
			'5'
		);
	});

	it('a 1e-7 step keeps every digit the user typed', () => {
		const step = d('0.0000001');
		expect(
			capStringFractionDigits('1.2345678', {
				maxFractionDigits: stepFractionDigits(step),
			})
		).to.equal('1.2345678');
	});
});

describe('format/input configuration', () => {
	afterEach(() => {
		setDefaultLocale(EN_US);
	});

	it('has one digit-cap table', () => {
		expect(DIGIT_CAPS.default).to.deep.equal({
			maxIntegerDigits: 12,
			maxFractionDigits: 10,
		});
		expect(DIGIT_CAPS.orderCount.maxIntegerDigits).to.equal(2);
		expect(DIGIT_CAPS.slippage).to.deep.equal({
			maxIntegerDigits: 3,
			maxFractionDigits: 6,
		});
	});

	it('supplies the mask caps and the outbound step from one call', () => {
		const market = marketPrecisionFromSizes({
			tickSize: new BN(100),
			tickPrecisionExp: 6,
			stepSize: new BN(1000000),
			stepPrecisionExp: 9,
		});
		const price = inputFieldConfig('price', { market });
		expect(price.caps.maxFractionDigits).to.equal(4);
		expect(price.precisionExp).to.equal(4);
		expect(price.step).to.deep.equal(market.tick);
		expect(price.localeTag).to.equal('en-US');
		expect(price.locale).to.deep.equal(EN_US);

		const size = inputFieldConfig('size', { market });
		expect(size.caps.maxFractionDigits).to.equal(3);
		expect(size.step).to.deep.equal(market.step);
	});

	it('applies per-field overrides', () => {
		expect(
			inputFieldConfig('default', { overrides: { maxFractionDigits: 2 } }).caps
		).to.deep.equal({ maxIntegerDigits: 12, maxFractionDigits: 2 });
	});

	it('precisionExp follows a clamped market rather than the raw step', () => {
		const market = marketPrecisionFromSizes({
			tickSize: new BN(100),
			tickPrecisionExp: 6,
			stepSize: new BN(1000000),
			stepPrecisionExp: 9,
			maxPriceDecimals: 2,
		});
		const price = inputFieldConfig('price', { market });
		expect(price.caps.maxFractionDigits).to.equal(2);
		expect(price.precisionExp).to.equal(2);
		const parsed = parseInput('1.23456', price.precisionExp!).value!;
		expect(toPlainString(parsed)).to.equal('1.23');
		expect(parsed.scale).to.be.at.most(price.caps.maxFractionDigits);
	});

	it('precisionExp follows an override rather than the raw step', () => {
		const market = marketPrecisionFromSizes({
			tickSize: new BN(100),
			tickPrecisionExp: 6,
			stepSize: new BN(1000000),
			stepPrecisionExp: 9,
		});
		const size = inputFieldConfig('size', {
			market,
			overrides: { maxFractionDigits: 1 },
		});
		expect(size.precisionExp).to.equal(1);
		expect(parseInput('1.9876', size.precisionExp!).value!.scale).to.be.at.most(
			size.caps.maxFractionDigits
		);

		const plain = inputFieldConfig('default', {
			overrides: { maxFractionDigits: 1 },
		});
		expect(plain.precisionExp).to.equal(1);
		expect(
			toPlainString(parseInput('1.9876', plain.precisionExp!).value!)
		).to.equal('1.9');
	});

	it('price and size need a market', () => {
		expect(() => inputFieldConfig('price')).to.throw(/requires a market/);
		expect(() => inputFieldConfig('size')).to.throw(/requires a market/);
	});

	it('parseInput strips group separators and caps the fraction', () => {
		expect(toPlainString(parseInput('1,234.5', 6).value!)).to.equal('1234.5');
		expect(toPlainString(parseInput('1.23456789', 4).value!)).to.equal(
			'1.2345'
		);
		expect(parseInput('', 4).status).to.equal('invalid');
		expect(parseInput('abc', 4).status).to.equal('invalid');
	});

	it('parseInput reads the locale it is given', () => {
		const deDe = {
			tag: 'de-DE',
			decimal: ',',
			group: '.',
			groupSizes: [3],
		} as const;
		expect(toPlainString(parseInput('1.234,5', 6, deDe).value!)).to.equal(
			'1234.5'
		);
	});

	it('parseInput rejects text written in the other locale convention', () => {
		const deDe = {
			tag: 'de-DE',
			decimal: ',',
			group: '.',
			groupSizes: [3],
		} as const;
		// Stripping the trailing group separator would read 1234.56 as 1.23.
		expect(parseInput('1,234.56', 6, deDe).status).to.equal('invalid');
		expect(parseInput('1.234,56', 6).status).to.equal('invalid');
		expect(toPlainString(parseInput('1,234.56', 6).value!)).to.equal('1234.56');
		expect(toPlainString(parseInput('1.234,56', 6, deDe).value!)).to.equal(
			'1234.56'
		);
	});

	it('parseInput round-trips a non-EN locale without being told', () => {
		setNumberLocale('de-DE');
		const cfg = inputFieldConfig('default');
		const text = formatText('1234.5');
		expect(text).to.not.equal('1,234.5');
		expect(toPlainString(parseInput(text, cfg.precisionExp!).value!)).to.equal(
			'1234.5'
		);
	});

	it('setNumberLocale feeds both the mask tag and the display config', () => {
		const locale = setNumberLocale('de-DE');
		expect(locale.decimal).to.equal(',');
		expect(locale.group).to.not.equal(',');
		expect(inputFieldConfig('default').localeTag).to.equal('de-DE');
	});

	it('localeFromTag derives non-uniform group sizes', () => {
		expect(localeFromTag('en-US').groupSizes).to.deep.equal([3]);
		expect(localeFromTag('en-IN').groupSizes).to.deep.equal([3, 2]);
	});
});

import { expect } from 'chai';
import {
	BASE_PRECISION_EXP,
	BigNum,
	BN,
	PerpMarketAccount,
	QUOTE_PRECISION_EXP,
} from '@velocity-exchange/sdk';
import {
	capStringFractionDigits,
	isExactMultiple,
	marketPrecisionFromSizes,
	snapValueToStep,
	stepFractionDigits,
} from '../../src/format/index';
import { fromString, toPlainString } from '../../src/format/core/index';
import { marketPrecisionFromAccount } from '../../src/format/adapters/sdk';
import { sizeDecimalsFromPrice } from '../../src/format/market';

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

	it('capStringFractionDigits pins the maxFractionDigits regressions the guard fixes', () => {
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: NaN })
		).to.equal('1.23456');
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: -1 })
		).to.equal('1.23456');
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: 2.5 })
		).to.equal('1.23456');
	});

	it('capStringFractionDigits also returns the input unchanged on an infinite maxFractionDigits', () => {
		// Not a regression: fraction.length <= Infinity was always true, so this
		// case passed through unchanged before the guard existed too.
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: Infinity })
		).to.equal('1.23456');
	});

	it('capStringFractionDigits still caps at a valid maxFractionDigits', () => {
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: 0 })
		).to.equal('1');
		expect(
			capStringFractionDigits('1.23456', { maxFractionDigits: 2 })
		).to.equal('1.23');
	});

	it('a 1e-7 step keeps every digit the user typed', () => {
		const step = d('0.0000001');
		expect(
			capStringFractionDigits('1.2345678', {
				maxFractionDigits: stepFractionDigits(step),
			})
		).to.equal('1.2345678');
	});

	it('isExactMultiple is exact, with no float tolerance anywhere', () => {
		expect(isExactMultiple('5.1', '0.1')).to.equal(true);
		expect(isExactMultiple('0.3', '0.1')).to.equal(true);
		expect(isExactMultiple('5', '2')).to.equal(false);
		expect(isExactMultiple('1.0000001', '0.0000001')).to.equal(true);
		expect(isExactMultiple('1.00000015', '0.0000001')).to.equal(false);
		expect(isExactMultiple('0.9999999', '1')).to.equal(false);
	});

	it('isExactMultiple returns false on a zero, missing or unparseable step', () => {
		expect(isExactMultiple(7, 0)).to.equal(false);
		expect(isExactMultiple('1', null)).to.equal(false);
		expect(isExactMultiple('1', 'nope')).to.equal(false);
		expect(isExactMultiple(null, '1')).to.equal(false);
	});

	it('isExactMultiple returns false on a negative step, as snapValueToStep does', () => {
		expect(isExactMultiple(10, -5)).to.equal(false);
		expect(isExactMultiple('10', '-5')).to.equal(false);
		expect(isExactMultiple(-10, -5)).to.equal(false);
		expect(isExactMultiple(10, -0.1)).to.equal(false);
		expect(snapValueToStep('10', '-5')).to.equal(null);
	});

	it('isExactMultiple reads BigNum and raw-unit inputs without a float hop', () => {
		expect(
			isExactMultiple(BigNum.fromPrint('1.5', new BN(9)), {
				raw: new BN(500000000),
				scale: 9,
			})
		).to.equal(true);
		expect(
			isExactMultiple(BigNum.fromPrint('1.5', new BN(9)), {
				raw: new BN(700000000),
				scale: 9,
			})
		).to.equal(false);
	});
});

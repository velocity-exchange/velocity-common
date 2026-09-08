import { expect } from 'chai';
import { PRESETS, formatText, formatValue } from '../../src/format/index';

/**
 * The presets the trading surfaces render with. Each one is checked for the
 * shape it declares and for what that shape produces, so a change to either
 * has to be deliberate.
 */
describe('the trading display presets', () => {
	it('are frozen all the way down', () => {
		const nested: [string, unknown][] = [
			['displayPrice.digits', PRESETS.displayPrice.digits],
			['displayPrice.sentinels', PRESETS.displayPrice.sentinels],
			['displayPrice.sentinels[0]', PRESETS.displayPrice.sentinels![0]],
			['priceText.digits', PRESETS.priceText.digits],
			['tradePrecisionHalfUp.digits', PRESETS.tradePrecisionHalfUp.digits],
			['baseAmount.digits', PRESETS.baseAmount.digits],
			['baseAmount.small', PRESETS.baseAmount.small],
			['earnBalance.digits', PRESETS.earnBalance.digits],
			['millifiedAmount.digits', PRESETS.millifiedAmount.digits],
			['millifiedAmount.abbreviate', PRESETS.millifiedAmount.abbreviate],
			['millifiedAmount.small', PRESETS.millifiedAmount.small],
			['millifiedAmount.sentinels', PRESETS.millifiedAmount.sentinels],
			['specialValue.abbreviate', PRESETS.specialValue.abbreviate],
			['specialValue.small', PRESETS.specialValue.small],
		];
		for (const [name, value] of nested) {
			expect(Object.isFrozen(value), name).to.equal(true);
		}
	});

	it('declare the shapes the UI holds today', () => {
		expect(PRESETS.displayPrice.digits).to.deep.equal({
			kind: 'significant',
			significant: 6,
			rounding: 'half-up',
		});
		expect(PRESETS.priceText.digits).to.deep.equal(PRESETS.displayPrice.digits);
		expect(PRESETS.priceText.trimTrailingZeros).to.equal(true);
		expect(PRESETS.priceText.grouping).to.equal(false);
		expect(PRESETS.tradePrecisionHalfUp.digits).to.deep.equal({
			kind: 'significant',
			significant: 6,
			rounding: 'half-up',
			maxDecimals: 5,
		});
		expect(PRESETS.baseAmount.digits).to.deep.equal({
			kind: 'significant',
			significant: 5,
			rounding: 'half-up',
			maxDecimals: 4,
		});
		expect(PRESETS.baseAmount.small).to.deep.equal({
			mode: 'sentinel',
			sentinelAt: '0.00001',
		});
		expect(PRESETS.earnBalance.digits).to.deep.equal({
			kind: 'decimals',
			decimals: 4,
			rounding: 'floor',
		});
		expect(PRESETS.millifiedAmount.abbreviate).to.deep.equal({
			threshold: '1000',
			digits: { kind: 'decimals', decimals: 2, rounding: 'half-up' },
		});
		expect(PRESETS.specialValue.abbreviate).to.deep.equal({
			minIntegerDigits: 7,
			digits: { kind: 'significant', significant: 6, rounding: 'half-up' },
			trimTrailingZeros: true,
		});
		expect(PRESETS.specialValue.small).to.deep.equal({ mode: 'subscript' });
	});

	it('displayPrice keeps six figures, grouped, with 0.00 for a zero price', () => {
		expect(formatText('1234.5678', PRESETS.displayPrice)).to.equal('1,234.57');
		expect(formatText('1234567', PRESETS.displayPrice)).to.equal('1,234,570');
		expect(formatText('0.000012345', PRESETS.displayPrice)).to.equal(
			'0.000012345'
		);
		expect(formatText('0', PRESETS.displayPrice)).to.equal('0.00');
		expect(formatValue('0', PRESETS.displayPrice).isSentinel).to.equal(true);
		expect(formatText('-1234.5678', PRESETS.displayPrice)).to.equal(
			'-1,234.57'
		);
	});

	it('priceText drops the grouping and the trailing zeros', () => {
		expect(formatText('1234.5678', PRESETS.priceText)).to.equal('1234.57');
		expect(formatText('1234.50000', PRESETS.priceText)).to.equal('1234.5');
		expect(formatText('0', PRESETS.priceText)).to.equal('0');
	});

	it('tradePrecisionHalfUp rounds six figures and stops at five decimals', () => {
		expect(formatText('1.23456789', PRESETS.tradePrecisionHalfUp)).to.equal(
			'1.23457'
		);
		expect(formatText('0.000012345', PRESETS.tradePrecisionHalfUp)).to.equal(
			'0.00001'
		);
		expect(formatText('1234567', PRESETS.tradePrecisionHalfUp)).to.equal(
			'1234570'
		);
		expect(formatText('0', PRESETS.tradePrecisionHalfUp)).to.equal('0.00000');
	});

	it('baseAmount holds five figures, four decimals and a small-amount bound', () => {
		expect(formatText('1.23456789', PRESETS.baseAmount)).to.equal('1.2346');
		expect(formatText('1234567', PRESETS.baseAmount)).to.equal('1,234,600');
		expect(formatText('0.00001', PRESETS.baseAmount)).to.equal('0.0000');
		expect(formatText('0.0000049', PRESETS.baseAmount)).to.equal('<0.00001');
		expect(formatText('-0.0000049', PRESETS.baseAmount)).to.equal('>-0.00001');
		expect(formatValue('0.0000049', PRESETS.baseAmount).usedSmallForm).to.equal(
			true
		);
	});

	it('earnBalance floors four decimals and trims what is left', () => {
		expect(formatText('12.99999', PRESETS.earnBalance)).to.equal('12.9999');
		expect(formatText('12.5000', PRESETS.earnBalance)).to.equal('12.5');
		expect(formatText('1234567.89', PRESETS.earnBalance)).to.equal(
			'1234567.89'
		);
		expect(formatText('0.00001', PRESETS.earnBalance)).to.equal('0');
	});

	it('millifiedAmount abbreviates past a thousand at two decimals', () => {
		expect(formatText('1234', PRESETS.millifiedAmount)).to.equal('1.23K');
		expect(formatText('999999.5', PRESETS.millifiedAmount)).to.equal('1.00M');
		expect(formatText('1000000000', PRESETS.millifiedAmount)).to.equal('1.00B');
		expect(formatText('999.994', PRESETS.millifiedAmount)).to.equal('999.99');
		expect(formatText('0.00456', PRESETS.millifiedAmount)).to.equal('0.0045');
		expect(formatText('0', PRESETS.millifiedAmount)).to.equal('0');
		expect(formatText(NaN, PRESETS.millifiedAmount)).to.equal('0');
		expect(formatText(Infinity, PRESETS.millifiedAmount)).to.equal('0');
	});

	it('specialValue takes a subscript below and an abbreviation above', () => {
		expect(formatText('0.0000012345', PRESETS.specialValue)).to.equal(
			'0.0₅12345'
		);
		expect(formatText('1234567', PRESETS.specialValue)).to.equal('1.23457M');
		expect(formatText('12345678', PRESETS.specialValue)).to.equal('12.3457M');
		const untouched = formatValue('1.5', PRESETS.specialValue);
		expect(untouched.usedSmallForm).to.equal(false);
		expect(untouched.wasAbbreviated).to.equal(false);
		expect(untouched.text).to.equal('1.5');
	});

	it('a seven-digit negative reads its digits from the magnitude', () => {
		expect(
			formatValue('-1234567', PRESETS.specialValue).wasAbbreviated
		).to.equal(true);
		expect(formatText('-1234567', PRESETS.specialValue)).to.equal('-1.23457M');
	});
});

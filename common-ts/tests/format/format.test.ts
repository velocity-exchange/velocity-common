import { expect } from 'chai';
import {
	EN_US,
	ENTIRE_POSITION,
	PRESETS,
	abbreviateValue,
	absBelowThreshold,
	belowThreshold,
	formatText,
	formatValue,
	fromString,
	groupInteger,
	leadingZeroCount,
	optionsForLegacyType,
	toSubscript,
	ungroup,
} from '../../src/format/index';

const d = (s: string) => fromString(s).value!;
const EN_IN = {
	tag: 'en-IN',
	decimal: '.',
	group: ',',
	groupSizes: [3, 2],
} as const;

describe('format/grouping', () => {
	it('groups uniformly and reverses', () => {
		expect(groupInteger('1234567', EN_US)).to.equal('1,234,567');
		expect(groupInteger('123', EN_US)).to.equal('123');
		expect(groupInteger('1000', EN_US)).to.equal('1,000');
		expect(ungroup('1,234,567', EN_US)).to.equal('1234567');
	});

	it('supports non-uniform group sizes', () => {
		expect(groupInteger('12345678', EN_IN)).to.equal('1,23,45,678');
	});
});

describe('format/formatValue sentinels and statuses', () => {
	it('renders the fallback for nullish input', () => {
		expect(formatText(null)).to.equal('-');
		expect(formatText(undefined, { fallback: '--' })).to.equal('--');
		expect(formatValue(null).status).to.equal('nullish');
	});

	it('renders infinity with its sign, distinctly from missing data', () => {
		expect(formatText(Infinity)).to.equal('∞');
		expect(formatText(-Infinity)).to.equal('-∞');
		expect(formatValue(Infinity).status).to.equal('non-finite');
		expect(formatValue(-Infinity).sign).to.equal('negative');
		expect(
			formatText(Infinity, {
				nonFiniteText: { positive: 'inf', negative: '-inf' },
			})
		).to.equal('inf');
	});

	it('separates corrupt input from missing input', () => {
		expect(formatText(NaN)).to.equal('?');
		expect(formatText('not a number', { invalidText: 'bad' })).to.equal('bad');
		expect(formatValue('nope').status).to.equal('invalid');
	});

	it('short-circuits on a matching sentinel at any precision exponent', () => {
		const result = formatValue(
			{ raw: { toString: () => '18446744073709551615' }, scale: 9 },
			{ sentinels: [ENTIRE_POSITION] }
		);
		expect(result.text).to.equal('Entire Position');
		expect(result.isSentinel).to.equal(true);

		expect(
			formatText(
				{ raw: { toString: () => '18446744073709551615' }, scale: 6 },
				{ sentinels: [ENTIRE_POSITION] }
			)
		).to.equal('Entire Position');
		expect(
			formatText(
				{ raw: { toString: () => '18446744072000000000' }, scale: 9 },
				{ sentinels: [ENTIRE_POSITION] }
			)
		).to.equal('Entire Position');
	});

	it('belowThreshold is signed and absBelowThreshold is not', () => {
		expect(formatText(-5, { sentinels: [belowThreshold('1', '1x')] })).to.equal(
			'1x'
		);
		expect(
			formatText(-5, { sentinels: [absBelowThreshold('1', 'tiny')] })
		).to.equal('-5');
	});
});

describe('format/formatValue digits and rounding', () => {
	it('exact is the default and never rounds', () => {
		expect(formatText('1234.5678')).to.equal('1,234.5678');
		expect(formatText('0.000000001')).to.equal('0.000000001');
	});

	it('decimals require an explicit rounding mode', () => {
		expect(() =>
			formatText('1.5', { digits: { kind: 'decimals', decimals: 0 } })
		).to.throw(/rounding mode is required/);
	});

	it('truncate and half-up differ at the last cent', () => {
		const digits = { kind: 'decimals' as const, decimals: 2 };
		expect(formatText('1.999', { digits, rounding: 'truncate' })).to.equal(
			'1.99'
		);
		expect(formatText('1.999', { digits, rounding: 'half-up' })).to.equal(
			'2.00'
		);
	});

	it('significant digits pad above one and do not below', () => {
		const digits = { kind: 'significant' as const, significant: 6 };
		expect(formatText('1.5', { digits, rounding: 'truncate' })).to.equal(
			'1.50000'
		);
		expect(formatText('0.00012345', { digits, rounding: 'truncate' })).to.equal(
			'0.00012345'
		);
	});

	it('tick and step read the market precision', () => {
		const market = {
			priceDecimals: 2,
			sizeDecimals: 3,
			tick: d('0.01'),
			step: d('0.001'),
			source: 'onchain' as const,
		};
		expect(
			formatText('64231.4567', {
				digits: { kind: 'tick' },
				rounding: 'half-up',
				market,
			})
		).to.equal('64,231.46');
		expect(
			formatText('1.23456', {
				digits: { kind: 'step' },
				rounding: 'truncate',
				market,
			})
		).to.equal('1.234');
		expect(() =>
			formatText('1', { digits: { kind: 'tick' }, rounding: 'half-up' })
		).to.throw(/requires options.market/);
	});

	it('the magnitude heuristic scales decimals by asset price', () => {
		expect(
			formatText('0.123456789', {
				digits: { kind: 'magnitude', assetPrice: '30000' },
				rounding: 'truncate',
			})
		).to.equal('0.123456');
		expect(
			formatText('0.123456789', {
				digits: { kind: 'magnitude', assetPrice: '5' },
				rounding: 'truncate',
			})
		).to.equal('0.12');
	});

	it('reports what the rounding did', () => {
		const result = formatValue('1.999', {
			digits: { kind: 'decimals', decimals: 2 },
			rounding: 'truncate',
		});
		expect(result.wasRounded).to.equal(true);
		expect(result.roundedAway).to.equal(false);
		expect(result.roundingApplied).to.equal('truncate');

		const away = formatValue('0.001', {
			digits: { kind: 'decimals', decimals: 2 },
			rounding: 'truncate',
		});
		expect(away.roundedAway).to.equal(true);
		expect(away.isZero).to.equal(true);
	});
});

describe('format/formatValue affixes and sign', () => {
	it('puts the sign before the currency symbol', () => {
		expect(formatText('-1234.5', PRESETS.usd)).to.equal('-$1,234.50');
		expect(formatValue('-1234.5', PRESETS.usd).parts.sign).to.equal('-');
		expect(formatValue('-1234.5', PRESETS.usd).parts.currency).to.equal('$');
	});

	it('preserves -$0.00 by default and suppresses it on request', () => {
		expect(formatText('-0.001', PRESETS.usd)).to.equal('-$0.00');
		expect(formatValue('-0.001', PRESETS.usd).sign).to.equal('negative');
		expect(formatValue('-0.001', PRESETS.usd).isZero).to.equal(true);

		const suppressed = formatValue('-0.001', {
			...PRESETS.usd,
			negativeZero: 'suppress',
		});
		expect(suppressed.text).to.equal('$0.00');
		expect(suppressed.sign).to.equal('zero');
		expect(suppressed.exactSign).to.equal('negative');
	});

	it('signDisplay covers every mode', () => {
		const base = { digits: { kind: 'exact' as const } };
		expect(formatText('5', { ...base, signDisplay: 'always' })).to.equal('+5');
		expect(formatText('0', { ...base, signDisplay: 'always' })).to.equal('+0');
		expect(formatText('0', { ...base, signDisplay: 'exceptZero' })).to.equal(
			'0'
		);
		expect(formatText('5', { ...base, signDisplay: 'exceptZero' })).to.equal(
			'+5'
		);
		expect(formatText('-5', { ...base, signDisplay: 'never' })).to.equal('5');
	});

	it('percent does not multiply unless asked', () => {
		expect(formatText('2.34', PRESETS.percent)).to.equal('2.34%');
		expect(
			formatText('0.0234', { ...PRESETS.percent, percentScale: 'ratio' })
		).to.equal('2.34%');
	});

	it('suffix is normalised to one leading space', () => {
		expect(formatText('1.25', { suffix: 'SOL' })).to.equal('1.25 SOL');
		expect(formatText('1.25', { suffix: '   SOL  ' })).to.equal('1.25 SOL');
		expect(formatText('1.25', { suffix: '' })).to.equal('1.25');
	});

	it('surround wraps unconditionally or only on negatives', () => {
		expect(
			formatText('-12.34', { ...PRESETS.usd, surround: 'parens' })
		).to.equal('(-$12.34)');
		expect(
			formatText('12.34', { ...PRESETS.usd, surround: 'parensIfNegative' })
		).to.equal('$12.34');
		expect(
			formatText('-12.34', { ...PRESETS.usd, surround: 'parensIfNegative' })
		).to.equal('(-$12.34)');
	});

	it('trims trailing zeros without leaving a dangling separator', () => {
		expect(
			formatText('1234.5000', {
				digits: { kind: 'exact' },
				trimTrailingZeros: true,
			})
		).to.equal('1,234.5');
		expect(
			formatText('1234.0000', {
				digits: { kind: 'exact' },
				trimTrailingZeros: true,
			})
		).to.equal('1,234');
		expect(
			formatText('1.2000', {
				digits: { kind: 'decimals', decimals: 4, minDecimals: 2 },
				rounding: 'truncate',
				trimTrailingZeros: true,
			})
		).to.equal('1.20');
	});

	it('grouping can be turned off', () => {
		expect(formatText('1234567', { grouping: false })).to.equal('1234567');
	});
});

describe('format/abbreviate', () => {
	const always = { threshold: 'always' as const };

	it('abbreviates on the financial table', () => {
		expect(formatText('4582930', { abbreviate: always })).to.equal('4.58M');
		expect(formatText('1234', { abbreviate: always })).to.equal('1.23K');
		expect(formatText('100000', { abbreviate: always })).to.equal('100K');
		expect(formatText('1000', { abbreviate: always })).to.equal('1.00K');
	});

	it('re-derives the unit after a carry', () => {
		expect(
			formatText('999999', { abbreviate: { ...always, rounding: 'half-up' } })
		).to.equal('1.00M');
		expect(formatText('999999', { abbreviate: always })).to.equal('999K');
	});

	it('respects the default 10,000 threshold and falls through below it', () => {
		expect(formatText('9999.5', { abbreviate: {} })).to.equal('9,999.5');
		expect(formatText('10000', { abbreviate: {} })).to.equal('10.0K');
		expect(formatValue('9999.5', { abbreviate: {} }).wasAbbreviated).to.equal(
			false
		);
	});

	it('reports the unit and exponent as data', () => {
		const result = formatValue('4582930', { abbreviate: always });
		expect(result.wasAbbreviated).to.equal(true);
		expect(result.abbreviation).to.deep.equal({ unit: 'M', exponent: 6 });
		expect(result.parts.unit).to.equal('M');
		expect(result.parts.integer).to.equal('4');
		expect(result.parts.fraction).to.equal('58');
	});

	it('uses the SI table on request', () => {
		expect(
			formatText('4582930000', { abbreviate: { ...always, units: 'si' } })
		).to.equal('4.58G');
		expect(formatText('4582930000', { abbreviate: always })).to.equal('4.58B');
	});

	it('clamps past the largest unit instead of emitting undefined', () => {
		const clamped = formatValue('1234000000000000000', {
			abbreviate: always,
		});
		expect(clamped.text).to.equal('1,230Q');
		expect(clamped.parts.unit).to.equal('Q');

		expect(
			formatText('1234000000000000000', {
				abbreviate: { ...always, overflow: 'full' },
			})
		).to.equal('1,234,000,000,000,000,000');
	});

	it('minIntegerDigits reproduces the large branch gate', () => {
		expect(
			formatText('123456', { abbreviate: { minIntegerDigits: 7 } })
		).to.equal('123,456');
		expect(
			formatText('1234567', { abbreviate: { minIntegerDigits: 7 } })
		).to.equal('1.23M');
	});

	it('abbreviateValue is callable on its own', () => {
		const result = abbreviateValue(d('4582930'), { threshold: 'always' });
		expect(result).to.include({ applied: true, unit: 'M', exponent: 6 });
	});
});

describe('format/small numbers', () => {
	it('counts leading zeros exactly', () => {
		expect(leadingZeroCount(d('0.00012345'))).to.equal(3);
		expect(leadingZeroCount(d('0.000012345'))).to.equal(4);
		expect(leadingZeroCount(d('1.5'))).to.equal(0);
	});

	it('engages only past the configured leading-zero count', () => {
		const small = { mode: 'significant' as const };
		expect(formatText('0.00012345', { small })).to.equal('0.00012345');
		expect(formatText('0.000012345', { small })).to.equal('0.0000123');
	});

	it('renders the unicode subscript form', () => {
		expect(
			formatText('0.000012345', { small: { mode: 'subscript' } })
		).to.equal('0.0₄123');
		expect(toSubscript(12)).to.equal('₁₂');
	});

	it('sentinel mode uses abs, so negatives are not mislabelled', () => {
		const small = { mode: 'sentinel' as const, sentinelAt: '0.00001' };
		expect(formatText('0.000001', { small })).to.equal('<0.00001');
		expect(formatText('-0.000001', { small })).to.equal('>-0.00001');
		expect(formatText('-1.5', { small })).to.equal('-1.5');
		expect(formatValue('0.000001', { small }).usedSmallForm).to.equal(true);
	});
});

describe('format/presets', () => {
	it('usd reproduces today truncate-at-the-cent semantics', () => {
		expect(formatText('123.456789', PRESETS.usd)).to.equal('$123.45');
		expect(formatText('123.456789', PRESETS.usdHalfUp)).to.equal('$123.46');
		expect(PRESETS.usd).to.equal(PRESETS.usdLegacy);
	});

	it('balance floors on both signs', () => {
		expect(formatText('1.239', PRESETS.balance)).to.equal('$1.23');
		expect(formatText('-1.231', PRESETS.balance)).to.equal('-$1.24');
	});

	it('signed presets show a plus', () => {
		expect(formatText('1234.5', PRESETS.usdSigned)).to.equal('+$1,234.50');
		expect(formatText('2.34', PRESETS.percentSigned)).to.equal('+2.34%');
	});

	it('funding presets differ only in decimals', () => {
		expect(formatText('0.0012345', PRESETS.fundingHourly)).to.equal('0.00123%');
		expect(formatText('0.0012345', PRESETS.funding24h)).to.equal('0.00%');
	});

	it('tradePrecision is six significant figures, truncated', () => {
		expect(formatText('0.00012345678', PRESETS.tradePrecision)).to.equal(
			'0.000123456'
		);
		expect(formatText('12345678', PRESETS.tradePrecision)).to.equal(
			'12,345,600'
		);
	});

	it('leverage is a whole number with an x, clamped at one', () => {
		expect(formatText('12.34', PRESETS.leverage)).to.equal('12x');
		expect(formatText('-5', PRESETS.leverage)).to.equal('1x');
		expect(formatText('0.5', PRESETS.leverage)).to.equal('1x');
	});

	it('orderSize is exact with the entire-position sentinel', () => {
		expect(formatText('1.25000', PRESETS.orderSize)).to.equal('1.25');
		expect(
			formatText(
				{ raw: { toString: () => '18446744073709551615' }, scale: 9 },
				PRESETS.orderSize
			)
		).to.equal('Entire Position');
	});

	it('usdCompact collapses the five hand-rolled threshold sites', () => {
		expect(formatText('9999', PRESETS.usdCompact)).to.equal('$9,999.00');
		expect(formatText('4582930', PRESETS.usdCompact)).to.equal('$4.58M');
	});

	it('plain never groups', () => {
		expect(formatText('1234567.5', PRESETS.plain)).to.equal('1234567.5');
	});

	it('optionsForLegacyType resolves every runtime type', () => {
		expect(formatText('1234.5', optionsForLegacyType('currency'))).to.equal(
			'$1,234.50'
		);
		expect(formatText('1234.5', optionsForLegacyType('number'))).to.equal(
			'1,234.5'
		);
		expect(
			formatText('1234.5', optionsForLegacyType('number_signed'))
		).to.equal('+1,234.5');
		expect(formatText('2.34', optionsForLegacyType('percentage'))).to.equal(
			'2.34%'
		);
		expect(
			formatText('2.34', optionsForLegacyType('percentage_signed'))
		).to.equal('+2.34%');
		expect(
			formatText('-1234.5', optionsForLegacyType('currency_signed'))
		).to.equal('-$1,234.50');
	});
});

describe('format/formatValue parts', () => {
	it('exposes every segment separately', () => {
		const result = formatValue('-1234.5', {
			...PRESETS.usd,
			suffix: 'USDC',
			surround: 'parens',
		});
		expect(result.parts).to.deep.equal({
			surroundStart: '(',
			sign: '-',
			currency: '$',
			integer: '1,234',
			decimalSeparator: '.',
			fraction: '50',
			unit: '',
			percent: '',
			suffix: ' USDC',
			surroundEnd: ')',
		});
		expect(result.text).to.equal('(-$1,234.50 USDC)');
	});

	it('keeps the untouched input available for maths', () => {
		const result = formatValue('1.999', {
			digits: { kind: 'decimals', decimals: 2 },
			rounding: 'truncate',
		});
		expect(result.exact).to.deep.equal(d('1.999'));
	});
});

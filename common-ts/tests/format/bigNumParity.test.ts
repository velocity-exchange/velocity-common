import { expect } from 'chai';
import { BN, BigNum } from '@velocity-exchange/sdk';
import { FormatOptions, PRESETS, formatText } from '../../src/format/index';

/**
 * Pins the new presets against the real BigNum output they replace. A case
 * listed in KNOWN_DIFFS is a BigNum bug the new path deliberately does not
 * reproduce; every other case must match byte for byte.
 */

interface Case {
	label: string;
	units: string;
	scale: number;
}

const CORPUS: Case[] = [
	{ label: 'zero @6', units: '0', scale: 6 },
	{ label: 'zero @0', units: '0', scale: 0 },
	{ label: '-0.001 @6', units: '-1000', scale: 6 },
	{ label: '0.5 @1', units: '5', scale: 1 },
	{ label: '-0.5 @1', units: '-5', scale: 1 },
	{ label: '1.5 @1', units: '15', scale: 1 },
	{ label: '2.5 @1', units: '25', scale: 1 },
	{ label: '-1.999 @3', units: '-1999', scale: 3 },
	{ label: '123.456789 @6', units: '123456789', scale: 6 },
	{ label: '-123.456789 @6', units: '-123456789', scale: 6 },
	{ label: '1234.5 @1', units: '12345', scale: 1 },
	{ label: '-1234.5 @1', units: '-12345', scale: 1 },
	{ label: '12 @0', units: '12', scale: 0 },
	{ label: '1000 @0', units: '1000', scale: 0 },
	{ label: '100000 @0', units: '100000', scale: 0 },
	{ label: '999999 @0', units: '999999', scale: 0 },
	{ label: '999999.99 @2', units: '99999999', scale: 2 },
	{ label: '999999.5 @1', units: '9999995', scale: 1 },
	{ label: '1e6 @0', units: '1000000', scale: 0 },
	{ label: '1234567 @0', units: '1234567', scale: 0 },
	{ label: '12345678 @0', units: '12345678', scale: 0 },
	{ label: '4582930 @0', units: '4582930', scale: 0 },
	{ label: '-4582930 @0', units: '-4582930', scale: 0 },
	{ label: '1e15 @6', units: '1000000000000000000000', scale: 6 },
	{ label: '1e18 @6', units: '1000000000000000000000000', scale: 6 },
	{ label: '1e21 @6', units: '1000000000000000000000000000', scale: 6 },
	{ label: 'u64max @9 BASE', units: '18446744073709551615', scale: 9 },
	{ label: 'u64max @6 QUOTE', units: '18446744073709551615', scale: 6 },
	{ label: 'u64max-alt @9', units: '18446744072000000000', scale: 9 },
	{ label: '-u64max @9', units: '-18446744073709551615', scale: 9 },
	{ label: '2.95e-7 @9', units: '295', scale: 9 },
	{ label: '3 leading zeros @8', units: '12345', scale: 8 },
	{ label: '4 leading zeros @9', units: '12345', scale: 9 },
	{ label: '-4 leading zeros @9', units: '-12345', scale: 9 },
	{ label: '6sf boundary @12', units: '123456789', scale: 12 },
	{ label: 'negative base @9', units: '-1500000000', scale: 9 },
];

const FIXED_2: FormatOptions = {
	digits: { kind: 'decimals', decimals: 2 },
	rounding: 'truncate',
	grouping: false,
};
const TRADE_PRECISION: FormatOptions = {
	...PRESETS.tradePrecision,
	grouping: false,
};

const METHODS: {
	name: string;
	legacy: (b: BigNum) => string;
	options: FormatOptions;
}[] = [
	{ name: 'print', legacy: (b) => b.print(), options: PRESETS.plain },
	{
		name: 'printShort',
		legacy: (b) => b.printShort(),
		options: PRESETS.printShort,
	},
	{
		name: 'prettyPrint',
		legacy: (b) => b.prettyPrint(),
		options: PRESETS.prettyPrint,
	},
	{ name: 'toFixed(2)', legacy: (b) => b.toFixed(2), options: FIXED_2 },
	{
		name: 'toNotional',
		legacy: (b) => b.toNotional(),
		options: PRESETS.usdLegacy,
	},
	{
		name: 'toMillified',
		legacy: (b) => b.toMillified(),
		options: PRESETS.millifyLegacy,
	},
	{
		name: 'toTradePrecision',
		legacy: (b) => b.toTradePrecision(),
		options: TRADE_PRECISION,
	},
];

/**
 * key -> [bug name, what the new presets render instead]. Only the replacement
 * is asserted, because the point is the new output, not the old one.
 */
const KNOWN_DIFFS: Record<string, [string, string]> = {
	'toTradePrecision|1e6 @0': [
		'uc-price-6sf: toPrecision(6, true) drops magnitude at or above 1e6',
		'1000000',
	],
	'toTradePrecision|1234567 @0': [
		'uc-price-6sf: toPrecision(6, true) drops magnitude at or above 1e6',
		'1234560',
	],
	'toTradePrecision|12345678 @0': [
		'uc-price-6sf: toPrecision(6, true) drops magnitude at or above 1e6',
		'12345600',
	],
	'toTradePrecision|4582930 @0': [
		'uc-price-6sf: toPrecision(6, true) drops magnitude at or above 1e6',
		'4582930',
	],
	'toTradePrecision|-4582930 @0': [
		'uc-price-6sf: toPrecision(6, true) drops magnitude at or above 1e6',
		'-4582930',
	],
	'toMillified|1e18 @6': [
		'uc-millify: past the largest unit toMillified renders "1.00undefined"',
		'1000Q',
	],
	'toMillified|1e21 @6': [
		'uc-millify: past the largest unit toMillified renders "1.00undefined"',
		'1000000Q',
	],
};

const exercised = new Set<string>();

describe('format/BigNum parity', () => {
	for (const method of METHODS) {
		describe(method.name, () => {
			for (const testCase of CORPUS) {
				const key = `${method.name}|${testCase.label}`;
				const annotation = KNOWN_DIFFS[key];
				const title = annotation
					? `${testCase.label} differs by design (${annotation[0]})`
					: testCase.label;

				it(title, () => {
					const bigNum = new BigNum(
						new BN(testCase.units),
						new BN(testCase.scale)
					);
					const legacy = method.legacy(bigNum);
					const next = formatText(bigNum, method.options);

					if (annotation) {
						exercised.add(key);
						expect(next, 'declared replacement output').to.equal(annotation[1]);
						expect(next, 'a declared diff must actually differ').to.not.equal(
							legacy
						);
						return;
					}
					expect(next, `${method.name} ${testCase.label}`).to.equal(legacy);
				});
			}
		});
	}

	after(() => {
		expect(
			[...exercised].sort(),
			'a declared diff annotation no longer matches any case'
		).to.deep.equal(Object.keys(KNOWN_DIFFS).sort());
	});

	it('toFixed(0) leaves a dangling separator that the new path never emits', () => {
		const bigNum = new BigNum(new BN('15'), new BN(1));
		expect(bigNum.toFixed(0)).to.equal('1.');
		expect(
			formatText(
				{ raw: { toString: () => '15' }, scale: 1 },
				{ digits: { kind: 'decimals', decimals: 0 }, rounding: 'truncate' }
			)
		).to.equal('1');
	});

	it('a raw+scale duck object renders the same as the real BigNum', () => {
		const bigNum = new BigNum(new BN('-123456789'), new BN(6));
		const duck = { raw: { toString: () => '-123456789' }, scale: 6 };
		expect(formatText(duck, PRESETS.prettyPrint)).to.equal(
			formatText(bigNum, PRESETS.prettyPrint)
		);
		expect(formatText(duck, PRESETS.prettyPrint)).to.equal(
			bigNum.prettyPrint()
		);
	});

	it('a BigNum with negative precision still parses exactly', () => {
		expect(
			formatText(
				{ val: { toString: () => '15' }, precision: { toString: () => '-2' } },
				PRESETS.plain
			)
		).to.equal('1500');
	});
});

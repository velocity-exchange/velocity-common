import { expect } from 'chai';
import { BN, BigNum } from '@velocity-exchange/sdk';
import { FormatOptions, PRESETS, formatText } from '../../src/format/index';

/**
 * Differential fuzz against the real BigNum. bigNumParity.test.ts pins the cases
 * we reasoned about; this pins the ones we did not. Every generated value must
 * either match BigNum byte for byte or fall into one of the declared divergence
 * classes, which are the same bugs that file's annotations name.
 *
 * Seeded and fixed-iteration, so a failure always reproduces. Raise the count
 * with FORMAT_FUZZ_ITERATIONS to sweep harder before a release.
 */

const ITERATIONS = Number(process.env.FORMAT_FUZZ_ITERATIONS ?? 10000);

function makeRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Sample {
	units: string;
	scale: number;
}

function sampleValue(
	rng: () => number,
	maxDigits: number,
	maxScale: number
): Sample {
	const digitCount = 1 + Math.floor(rng() * maxDigits);
	let digits = '';
	for (let i = 0; i < digitCount; i++) digits += Math.floor(rng() * 10);
	digits = digits.replace(/^0+/, '') || '0';
	const negative = digits !== '0' && rng() < 0.4;
	return {
		units: (negative ? '-' : '') + digits,
		scale: Math.floor(rng() * (maxScale + 1)),
	};
}

/** Exact, because the generator strips leading zeros: >= 7 means >= 1e6. */
function integerDigits(sample: Sample): number {
	const digits = sample.units.replace('-', '');
	return Math.max(0, digits.length - sample.scale);
}

const FIXED_2: FormatOptions = {
	digits: { kind: 'decimals', decimals: 2, rounding: 'truncate' },
	grouping: false,
};
const FIXED_0: FormatOptions = {
	digits: { kind: 'decimals', decimals: 0, rounding: 'truncate' },
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
	{ name: 'toFixed(0)', legacy: (b) => b.toFixed(0), options: FIXED_0 },
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
 * A class permits a mismatch; it never requires one. Each sweep also asserts
 * exactly which classes fired, so a class that stops describing the code fails
 * the suite rather than quietly widening what counts as expected.
 */
const DIVERGENCES: {
	name: string;
	method: string;
	matches: (sample: Sample, legacy: string) => boolean;
}[] = [
	{
		name: 'uc-price-6sf',
		method: 'toTradePrecision',
		matches: (sample) => integerDigits(sample) >= 7,
	},
	{
		name: 'uc-millify',
		method: 'toMillified',
		matches: (_sample, legacy) => legacy.includes('undefined'),
	},
	{
		name: 'uc-fixed0',
		method: 'toFixed(0)',
		matches: (_sample, legacy) => legacy.endsWith('.'),
	},
];

/** Egress must stay plain text: no exponent, no leaked JS placeholder. */
const FORBIDDEN = ['e', 'undefined', 'NaN', 'Infinity'];

function sweep(
	label: string,
	seed: number,
	maxDigits: number,
	maxScale: number,
	expectFired: string[]
) {
	it(label, function () {
		this.timeout(20000);
		const rng = makeRng(seed);
		const fired = new Set<string>();

		for (let i = 0; i < ITERATIONS; i++) {
			const sample = sampleValue(rng, maxDigits, maxScale);
			const bigNum = new BigNum(new BN(sample.units), new BN(sample.scale));
			const where = `${sample.units} @${sample.scale}`;

			for (const method of METHODS) {
				const legacy = method.legacy(bigNum);
				const next = formatText(bigNum, method.options);

				for (const banned of FORBIDDEN) {
					expect(
						next.includes(banned),
						`${method.name} ${where} emitted ${banned} in "${next}"`
					).to.equal(false);
				}

				if (next === legacy) continue;

				const divergence = DIVERGENCES.find(
					(candidate) =>
						candidate.method === method.name &&
						candidate.matches(sample, legacy)
				);
				expect(
					divergence?.name,
					`undeclared divergence: ${method.name} ${where} gave "${next}", BigNum gave "${legacy}"`
				).to.be.a('string');
				fired.add(divergence!.name);
			}
		}

		expect(
			[...fired].sort(),
			'the divergence classes this sweep reaches have changed'
		).to.deep.equal([...expectFired].sort());
	});
}

describe('format/BigNum differential fuzz', () => {
	sweep('wide sweep: 1-22 digits, scale 0-12', 0x5eed1234, 22, 12, [
		'uc-price-6sf',
		'uc-millify',
		'uc-fixed0',
	]);
	sweep('small band: 1-6 digits, scale 0-13', 0xc0ffee, 6, 13, ['uc-fixed0']);
});

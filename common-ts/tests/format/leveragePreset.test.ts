import { expect } from 'chai';
import { PRESETS, formatText } from '../../src/format/index';

/**
 * Characterization corpus for the leverage preset. `formatLeverageLabel` below
 * is copied verbatim from protocol-v2-mono/ui/src/utils/formatting.ts and is
 * the oracle: the preset must reproduce it over the whole corpus except at the
 * cases listed in the diff table, and every entry in the table names the
 * behaviour it is there for.
 */
const formatLeverageLabel = (value: number | string): string => {
	const numeric = typeof value === 'string' ? parseFloat(value) : value;
	if (!numeric || numeric <= 0 || Number.isNaN(numeric)) return '1x';
	const fixed = numeric.toFixed(0);
	const trimmed = fixed.replace(/\.0+$/, '').replace(/(\.[1-9]*)0+$/, '$1');
	return `${trimmed}x`;
};

interface CorpusCase {
	key: string;
	legacy: () => string;
	next: () => string;
}

interface Divergence {
	behaviour: string;
	old: string;
	next: string;
}

const attempt = (fn: () => string) => {
	try {
		return fn();
	} catch (e) {
		return `THROWS: ${(e as Error).message}`;
	}
};

const runCorpus = (
	cases: CorpusCase[],
	divergences: Record<string, Divergence>
) => {
	const unusedKeys = new Set(Object.keys(divergences));
	for (const testCase of cases) {
		const legacy = attempt(testCase.legacy);
		const next = attempt(testCase.next);
		const divergence = divergences[testCase.key];
		if (divergence) {
			unusedKeys.delete(testCase.key);
			expect(legacy, `${testCase.key} old (${divergence.behaviour})`).to.equal(
				divergence.old
			);
			expect(next, `${testCase.key} new (${divergence.behaviour})`).to.equal(
				divergence.next
			);
		} else {
			expect(next, `${testCase.key} must be unchanged`).to.equal(legacy);
		}
	}
	expect(
		[...unusedKeys],
		'every annotated divergence must be reached'
	).to.deep.equal([]);
};

type Input = number | string | null | undefined;

const CORPUS: [string, Input][] = [
	['0', 0],
	['0.4', 0.4],
	['0.5', 0.5],
	['0.99', 0.99],
	['1', 1],
	['1.5', 1.5],
	['1.6', 1.6],
	['2', 2],
	['2.5', 2.5],
	['10', 10],
	['12.34', 12.34],
	['19.99', 19.99],
	['20', 20],
	['100.5', 100.5],
	['999.5', 999.5],
	['1000', 1000],
	['12345.6', 12345.6],
	['1234567', 1234567],
	['-1', -1],
	['-0.5', -0.5],
	['-0', -0],
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
	['null', null],
	['undefined', undefined],
	["'1.6'", '1.6'],
	["'  2 '", '  2 '],
	["'2x'", '2x'],
	['1e21', 1e21],
	["''", ''],
	["'abc'", 'abc'],
];

const CASES: CorpusCase[] = CORPUS.map(([key, value]) => ({
	key,
	legacy: () => formatLeverageLabel(value as number | string),
	next: () => formatText(value, PRESETS.leverage),
}));

const DIVERGENCES: Record<string, Divergence> = {
	Infinity: {
		behaviour: 'an infinite leverage renders as a symbol, not as the word',
		old: 'Infinityx',
		next: '∞x',
	},
	"'2x'": {
		behaviour: 'suffixed strings are not parsed',
		old: '2x',
		next: '1x',
	},
	'1e21': {
		behaviour:
			'the full integer is rendered, where toFixed switches to exponential',
		old: '1e+21x',
		next: '1000000000000000000000x',
	},
};

describe('the leverage preset reproduces formatLeverageLabel', () => {
	it('agrees with the UI helper outside the annotated cases', () => {
		runCorpus(CASES, DIVERGENCES);
	});
});

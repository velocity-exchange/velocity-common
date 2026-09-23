import { BN, SpotMarketConfig } from '@velocity-exchange/sdk';
import { formatTokenInputCurried } from '../../src/utils/validation/input';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/** Stands in for "setAmount was never called", so two rejections compare equal. */
const UNCHANGED = '<unchanged>';

/**
 * Copied from the pre-fix `formatTokenInputCurried` body: the oracle for the
 * corpus below. Every input the current implementation disagrees with it on
 * must be listed in DIVERGENCES, naming the behaviour that changed.
 */
function legacyFormatTokenInput(
	newAmount: string,
	precisionExp: number
): string {
	if (isNaN(+newAmount)) return UNCHANGED;
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

function run(newAmount: string, precisionExp: number): string {
	let captured = UNCHANGED;
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

const REALISTIC_AMOUNTS = [
	'1234.567891',
	'0.123456789',
	'10.500',
	'1000000',
	'0.00000005',
	'1.23456789e-10',
	'1e5',
];

/** Beyond typing prefixes: rejected shapes, non-finite/NaN, and precision-losing magnitudes. */
const EXTRA_CASES: Array<[string, number]> = [
	['', 6],
	['1,234.5', 6],
	['abc.', 6],
	['1.2.3.', 6],
	['.', 6],
	['-.', 6],
	['Infinity', 6],
	['NaN', 6],
	['-1', 6],
];

const repunit = (digits: number) => '1'.repeat(digits);
for (const precisionExp of [0, 6, 9]) {
	for (const digits of [20, 30, 35]) {
		EXTRA_CASES.push([repunit(digits), precisionExp]);
	}
}

// A prefix is the same input at the same precision regardless of which
// realistic amount it came from, so pairs are deduped by key before running.
const pairs = new Map<string, [string, number]>();
for (const amount of REALISTIC_AMOUNTS) {
	for (const precisionExp of [6, 9]) {
		for (const prefix of prefixesOf(amount)) {
			pairs.set(`${prefix}|${precisionExp}`, [prefix, precisionExp]);
		}
	}
}
for (const [input, precisionExp] of EXTRA_CASES) {
	pairs.set(`${input}|${precisionExp}`, [input, precisionExp]);
}

const CASES: CorpusCase[] = [...pairs.entries()].map(
	([key, [input, precisionExp]]) => ({
		key,
		legacy: () => legacyFormatTokenInput(input, precisionExp),
		next: () => run(input, precisionExp),
	})
);

const DIVERGENCES: Record<string, Divergence> = {
	'0.1234567|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '0.123457',
		next: '0.123456',
	},
	'0.12345678|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '0.123457',
		next: '0.123456',
	},
	'0.123456789|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '0.123457',
		next: '0.123456',
	},
	'1.2345678|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '1.234568',
		next: '1.234567',
	},
	'1.23456789|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '1.234568',
		next: '1.234567',
	},
	'0.00000005|6': {
		behaviour:
			'an all-zero truncation keeps the precision-many zero decimals, instead of collapsing to a bare 0 via a float round trip',
		old: '0',
		next: '0.000000',
	},
	'1.23456789e-1|6': {
		behaviour:
			'truncates typed input past precision rather than rounding it up',
		old: '0.123457',
		next: '0.123456',
	},
	'1.23456789e-10|6': {
		behaviour:
			'exponent notation expands to plain digits instead of a re-sliced exponential string',
		old: '1.23456789e-1',
		next: '0.000000',
	},
	'0.00000005|9': {
		behaviour: 'stays plain instead of reflowing into exponential notation',
		old: '5e-8',
		next: '0.00000005',
	},
	'1.23456789e-10|9': {
		behaviour:
			'exponent notation expands to plain digits instead of a re-sliced exponential string',
		old: '1.23456789e-1',
		next: '0.000000000',
	},
	'Infinity|6': {
		behaviour:
			'a non-finite value is rejected rather than displayed as the literal word',
		old: 'Infinity',
		next: UNCHANGED,
	},
};

for (const precisionExp of [0, 6, 9]) {
	DIVERGENCES[`${repunit(20)}|${precisionExp}`] = {
		behaviour:
			'a 20-digit amount keeps its exact digits instead of losing precision through a float',
		old: '11111111111111110000',
		next: repunit(20),
	};
	DIVERGENCES[`${repunit(30)}|${precisionExp}`] = {
		behaviour:
			'a 30-digit amount keeps its exact digits instead of reflowing into exponential notation',
		old: '1.111111111111111e+29',
		next: repunit(30),
	};
	DIVERGENCES[`${repunit(35)}|${precisionExp}`] = {
		behaviour:
			'a 35-digit amount keeps its exact digits instead of reflowing into exponential notation',
		old: '1.111111111111111e+34',
		next: repunit(35),
	};
}

describe('formatTokenInputCurried', () => {
	it('agrees with the pre-fix implementation outside the annotated divergences', () => {
		runCorpus(CASES, DIVERGENCES);
	});
});

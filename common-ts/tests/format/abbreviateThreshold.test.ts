import { expect } from 'chai';
import {
	FormatOptions,
	PRESETS,
	formatText,
	formatValue,
} from '../../src/format/index';
import millify from '../../src/utils/millify';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/**
 * The abbreviation threshold used to be checked against the raw value, so an
 * amount just under it that the preset's own digits round up to it printed in
 * full. The old engine cannot be frozen, so each row pins its old text as a
 * literal.
 */
const SLIVER =
	'an amount just under the threshold that rounds up to it now abbreviates';

const USD_10K: FormatOptions = {
	...PRESETS.usd,
	abbreviate: { threshold: '10000' },
};

interface Row {
	key: string;
	old: string;
	next?: string;
}

const CORPUS: Record<string, { format: (v: string) => string; rows: Row[] }> = {
	usdCompact: {
		format: (v) => formatText(v, PRESETS.usdCompact),
		rows: [
			{ key: '9999.994', old: '$9,999.99' },
			{ key: '9999.9949999', old: '$9,999.99' },
			{ key: '9999.995', old: '$10.0K' },
			{ key: '10000', old: '$10.0K' },
			{ key: '-9999.995', old: '-$10.0K' },
			{ key: '-9999.994', old: '-$9,999.99' },
		],
	},
	'usd with a 10000 threshold': {
		format: (v) => formatText(v, USD_10K),
		rows: [
			{ key: '9999.994', old: '$9,999.99' },
			// Abbreviates the $10,000.00 it used to print, at the default
			// 3 significant figures truncated.
			{ key: '9999.995', old: '$10,000.00', next: '$10.0K' },
			{ key: '9999.999', old: '$10,000.00', next: '$10.0K' },
			{ key: '10000', old: '$10.0K' },
			{ key: '-9999.995', old: '-$10,000.00', next: '-$10.0K' },
			{ key: '-9999.994', old: '-$9,999.99' },
		],
	},
	millifiedAmount: {
		format: (v) => formatText(v, PRESETS.millifiedAmount),
		rows: [
			{ key: '999.994', old: '999.99' },
			{ key: '999.995', old: '1,000.00', next: '1.00K' },
			{ key: '999.999', old: '1,000.00', next: '1.00K' },
			{ key: '1000', old: '1.00K' },
			{ key: '-999.995', old: '-1,000.00', next: '-1.00K' },
			{ key: '-999.994', old: '-999.99' },
		],
	},
	// Truncated digits never round up to the threshold.
	chartTick: {
		format: (v) => formatText(v, PRESETS.chartTick),
		rows: [
			{ key: '999', old: '999' },
			{ key: '999.9999', old: '999' },
			{ key: '1000', old: '1K' },
			{ key: '-999.9999', old: '-999' },
		],
	},
	// Exact digits never round.
	compact: {
		format: (v) => formatText(v, PRESETS.compact),
		rows: [
			{ key: '9999.99', old: '9,999.99' },
			{ key: '9999.99999', old: '9,999.99999' },
			{ key: '10000', old: '10K' },
			{ key: '-9999.99999', old: '-9,999.99999' },
		],
	},
	specialValue: {
		format: (v) => formatText(v, PRESETS.specialValue),
		rows: [
			{ key: '999999.99', old: '999999.99' },
			{ key: '999999.9999999', old: '999999.9999999' },
			{ key: '1000000', old: '1M' },
			{ key: '-999999.9999999', old: '-999999.9999999' },
		],
	},
	millifyLegacy: {
		format: (v) => formatText(v, PRESETS.millifyLegacy),
		rows: [
			{ key: '999.995', old: '999' },
			{ key: '1000', old: '1.00K' },
			{ key: '-999.995', old: '-999' },
		],
	},
	millify: {
		format: (v) => millify(Number(v)),
		rows: [
			{ key: '999.9994', old: '999.999' },
			{ key: '999.9995', old: '1000.00', next: '1.00000K' },
			{ key: '1000', old: '1.00000K' },
			{ key: '-999.9995', old: '-1000.00', next: '-1.00000K' },
		],
	},
	'millify at 3 significant figures': {
		format: (v) => millify(Number(v), { precision: 3 }),
		rows: [
			{ key: '999.4', old: '999' },
			{ key: '999.5', old: '1000', next: '1.00K' },
			{ key: '1000', old: '1.00K' },
			{ key: '-999.5', old: '-1000', next: '-1.00K' },
		],
	},
};

describe('format/abbreviateThreshold', () => {
	for (const [name, { format, rows }] of Object.entries(CORPUS)) {
		it(`${name} checks the threshold after rounding`, () => {
			const cases: CorpusCase[] = rows.map((r) => ({
				key: r.key,
				legacy: () => r.old,
				next: () => format(r.key),
			}));
			const divergences: Record<string, Divergence> = {};
			for (const r of rows) {
				if (r.next !== undefined) {
					divergences[r.key] = { behaviour: SLIVER, old: r.old, next: r.next };
				}
			}
			runCorpus(cases, divergences);
		});
	}

	it('reports the rounding that carried the value past the threshold', () => {
		const result = formatValue('9999.995', {
			...PRESETS.usd,
			abbreviate: { threshold: '10000' },
		});
		expect(result.text).to.equal('$10.0K');
		expect(result.wasRounded).to.equal(true);
		expect(result.roundingApplied).to.equal('half-up');
	});
});

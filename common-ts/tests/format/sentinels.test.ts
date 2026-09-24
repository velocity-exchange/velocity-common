import { BN, BigNum } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { PRESETS, formatText, formatValue } from '../../src/format/index';
import { isEntirePositionOrder } from '../../src/utils/trading/size';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/**
 * Characterization corpus for the entire-position sentinel. `isEntirePositionOrder`
 * is the oracle: the sentinel must reproduce it over the whole corpus except at
 * the cases listed in the diff table, and every entry in the table names the
 * behaviour it is there for.
 */

const MARKERS = {
	u64Max: '18446744073709551615',
	truncated: '18446744072000000000',
};

const PRECISIONS = [6, 9, 13];

const buildCases = (): CorpusCase[] => {
	const cases: CorpusCase[] = [];
	const add = (key: string, raw: bigint, precision: number) => {
		const amount = () => new BigNum(new BN(raw.toString()), new BN(precision));
		cases.push({
			key,
			legacy: () => String(isEntirePositionOrder(amount())),
			next: () => String(formatValue(amount(), PRESETS.orderSize).isSentinel),
		});
	};

	for (const [marker, units] of Object.entries(MARKERS)) {
		for (const precision of PRECISIONS) {
			const printedUnit = BigInt(10) ** BigInt(precision);
			const offsets: [string, bigint][] = [
				['exact', BigInt(0)],
				['+1 raw', BigInt(1)],
				['-1 raw', BigInt(-1)],
				['+1 printed', printedUnit],
				['-1 printed', -printedUnit],
				['+half printed', printedUnit / BigInt(2)],
				['-half printed', -printedUnit / BigInt(2)],
			];
			for (const [offset, delta] of offsets) {
				const magnitude = BigInt(units) + delta;
				add(`${marker} ${offset} pos p${precision}`, magnitude, precision);
				add(`${marker} ${offset} neg p${precision}`, -magnitude, precision);
			}
		}
	}

	for (const [label, magnitude] of [
		['zero', BigInt(0)],
		['ordinary', BigInt('1234500000')],
	] as [string, bigint][]) {
		for (const precision of PRECISIONS) {
			add(`${label} pos p${precision}`, magnitude, precision);
			add(`${label} neg p${precision}`, -magnitude, precision);
		}
	}

	return cases;
};

// ENTIRE_POSITION now uses the same tolerance and the same two markers as
// isEntirePositionOrder, so the corpus is expected to agree everywhere. Any
// key that shows up here is a real, reported disagreement, not an intended one.
const DIVERGENCES: Record<string, Divergence> = {};

describe('ENTIRE_POSITION matches the exact marker on a positive size', () => {
	it('reproduces isEntirePositionOrder outside the annotated cases', () => {
		runCorpus(buildCases(), DIVERGENCES);
	});

	it('renders the marker text only for the positive amount', () => {
		const amount = (sign: 1 | -1) =>
			new BigNum(new BN(MARKERS.u64Max).muln(sign), new BN(9));
		expect(formatText(amount(1), PRESETS.orderSize)).to.equal(
			'Entire Position'
		);
		expect(formatText(amount(-1), PRESETS.orderSize)).to.equal(
			'-18,446,744,073.709551615'
		);
	});
});

describe('ENTIRE_POSITION recognises the step-rounded u64::MAX', () => {
	// standardize_base_asset_amount(u64::MAX, step) floors u64::MAX to a
	// multiple of the market step, at BASE precision (9 decimals).
	const rounded = (step: bigint) => {
		const max = BigInt(MARKERS.u64Max);
		return ((max / step) * step).toString();
	};

	const cases: [string, bigint][] = [
		['1e6', BigInt(1_000_000)],
		['1e7', BigInt(10_000_000)],
		['1e9', BigInt(1_000_000_000)],
	];

	for (const [label, step] of cases) {
		it(`step ${label}: orderSize and orderSizeStep both read Entire Position`, () => {
			const input = { raw: { toString: () => rounded(step) }, scale: 9 };
			expect(formatText(input, PRESETS.orderSize)).to.equal('Entire Position');
			expect(formatText(input, PRESETS.orderSizeStep)).to.equal(
				'Entire Position'
			);
		});
	}

	it('the two exact marker values still match', () => {
		for (const units of Object.values(MARKERS)) {
			const input = { raw: { toString: () => units }, scale: 9 };
			expect(formatText(input, PRESETS.orderSize)).to.equal('Entire Position');
		}
	});

	it('one whole unit below u64::MAX does not match', () => {
		// At precision 6 the two markers (1,709,551,615 raw units apart) sit well
		// outside each other's tolerance band, so this is an unambiguous miss. At
		// precision 9 the same offset lands inside the truncated marker's own
		// band instead, and the agreement corpus below covers that case.
		const oneUnitBelow = (
			BigInt(MARKERS.u64Max) -
			BigInt(10) ** BigInt(6)
		).toString();
		const input = { raw: { toString: () => oneUnitBelow }, scale: 6 };
		expect(formatValue(input, PRESETS.orderSize).isSentinel).to.equal(false);
	});

	it('a negative amount with the same units never matches', () => {
		const input = {
			raw: { toString: () => `-${MARKERS.u64Max}` },
			scale: 9,
		};
		expect(formatValue(input, PRESETS.orderSize).isSentinel).to.equal(false);
	});
});

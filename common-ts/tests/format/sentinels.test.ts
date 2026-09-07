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

// The old check compared the two amounts as doubles and accepted a difference
// below 1, which is one whole PRINTED unit, so every near miss read as the
// marker. The sentinel now matches the exact units and nothing else.
const TOLERANCE =
	'a value within one printed unit of the marker no longer reads as the marker';
// The two markers are 1,709,551,615 raw units apart. Past precision 9 that gap
// is under one printed unit, so a value offset from one marker could land
// inside the old tolerance band of the other.
const OVERLAP = 'an offset from one marker no longer reads as the other marker';

const banded = (behaviour: string): Divergence => ({
	behaviour,
	old: 'true',
	next: 'false',
});

const DIVERGENCES: Record<string, Divergence> = {
	'u64Max +1 raw pos p6': banded(TOLERANCE),
	'u64Max -1 raw pos p6': banded(TOLERANCE),
	'u64Max +half printed pos p6': banded(TOLERANCE),
	'u64Max -half printed pos p6': banded(TOLERANCE),
	'u64Max +1 raw pos p9': banded(TOLERANCE),
	'u64Max -1 raw pos p9': banded(TOLERANCE),
	'u64Max +half printed pos p9': banded(TOLERANCE),
	'u64Max -half printed pos p9': banded(TOLERANCE),
	'u64Max -1 printed pos p9': banded(OVERLAP),
	'truncated +1 raw pos p6': banded(TOLERANCE),
	'truncated -1 raw pos p6': banded(TOLERANCE),
	'truncated +half printed pos p6': banded(TOLERANCE),
	'truncated -half printed pos p6': banded(TOLERANCE),
	'truncated +1 raw pos p9': banded(TOLERANCE),
	'truncated -1 raw pos p9': banded(TOLERANCE),
	'truncated +half printed pos p9': banded(TOLERANCE),
	'truncated -half printed pos p9': banded(TOLERANCE),
	'truncated +1 printed pos p9': banded(OVERLAP),
	'u64Max +1 raw pos p13': banded(TOLERANCE),
	'u64Max -1 raw pos p13': banded(TOLERANCE),
	'u64Max +half printed pos p13': banded(TOLERANCE),
	'u64Max -half printed pos p13': banded(TOLERANCE),
	'u64Max -1 printed pos p13': banded(OVERLAP),
	'truncated +1 raw pos p13': banded(TOLERANCE),
	'truncated -1 raw pos p13': banded(TOLERANCE),
	'truncated +half printed pos p13': banded(TOLERANCE),
	'truncated -half printed pos p13': banded(TOLERANCE),
	'truncated +1 printed pos p13': banded(OVERLAP),
};

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

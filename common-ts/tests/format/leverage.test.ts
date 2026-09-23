import { exactLeverageFromMarginRatio } from '../../src/utils/trading/leverage';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/**
 * Characterization corpus for `exactLeverageFromMarginRatio`. `legacy`
 * reproduces the float expressions the toFixed(2) call sites used before
 * this change; `next` is the helper they now share.
 */
const marginRatioCases: CorpusCase[] = [];
for (let mr = 1; mr <= 10000; mr++) {
	marginRatioCases.push({
		key: `mr=${mr}`,
		legacy: () => String(parseFloat((1 / (mr / 10000)).toFixed(2))),
		next: () => String(exactLeverageFromMarginRatio(mr, 2)),
	});
}

// The spot-market call site derives its margin ratio as
// `initialLiabilityWeight - 10000` before dividing, which is what
// reintroduces the float subtraction error below.
const liabilityWeightCases: CorpusCase[] = [];
for (let lw = 10001; lw <= 30000; lw++) {
	liabilityWeightCases.push({
		key: `lw=${lw}`,
		legacy: () => {
			const liabilityWeight = lw / 10000;
			return String(parseFloat((1 / (liabilityWeight - 1)).toFixed(2)));
		},
		next: () => String(exactLeverageFromMarginRatio(lw - 10000, 2)),
	});
}

const LIABILITY_WEIGHT_DIVERGENCES: Record<string, Divergence> = {
	'lw=10640': {
		behaviour:
			"10000/640 is exactly 15.625, a float tie; the old expression's " +
			'subtraction (liabilityWeight - 1) lands just under it and rounds ' +
			'down, the new one rounds the exact tie up',
		old: '15.62',
		next: '15.63',
	},
	'lw=13200': {
		behaviour:
			"10000/3200 is exactly 3.125, a float tie; the old expression's " +
			'subtraction (liabilityWeight - 1) lands just under it and rounds ' +
			'down, the new one rounds the exact tie up',
		old: '3.12',
		next: '3.13',
	},
};

describe('exactLeverageFromMarginRatio', () => {
	it('matches the old float expression for every margin ratio from 1 to 10000', () => {
		runCorpus(marginRatioCases, {});
	});

	it('matches the old spot-market expression for every liability weight from 10001 to 30000, except two exact ties', () => {
		runCorpus(liabilityWeightCases, LIABILITY_WEIGHT_DIVERGENCES);
	});
});

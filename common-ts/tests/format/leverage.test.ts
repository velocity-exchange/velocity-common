import { expect } from 'chai';
import {
	MarketType,
	PerpMarketAccount,
	SpotMarketAccount,
} from '@velocity-exchange/sdk';
import { convertMarginRatioToLeverage } from '../../src/utils/trading/leverage';
import { exactLeverageFromMarginRatio } from '../../src/utils/trading/exactLeverage';
import { getMaxLeverageForMarketAccount } from '../../src/utils/markets/leverage';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/**
 * Characterization corpus for `exactLeverageFromMarginRatio` and its three
 * call sites. `legacy` reproduces the float expressions each site used
 * before the exact helper existed; `next` is what the site (or the helper
 * directly) computes now.
 */

// Pre-fix `convertMarginRatioToLeverage`, verbatim.
const legacyConvertMarginRatioToLeverage = (
	marginRatio: number,
	decimals?: number
): number | undefined => {
	if (!marginRatio) return undefined;
	const leverage = 1 / (marginRatio / 10000);
	return decimals
		? parseFloat(leverage.toFixed(decimals))
		: Math.round(leverage);
};

// Pre-fix perp/spot branches of `getMaxLeverageForMarketAccount`, verbatim.
const legacyPerpMaxLeverage = (marginRatioInitial: number): number =>
	parseFloat((1 / (marginRatioInitial / 10000)).toFixed(2));

const legacySpotMaxLeverage = (initialLiabilityWeight: number): number =>
	parseFloat((1 / (initialLiabilityWeight / 10000 - 1)).toFixed(2));

const marginRatioCases: CorpusCase[] = [];
for (let mr = 1; mr <= 10000; mr++) {
	marginRatioCases.push({
		key: `mr=${mr}`,
		legacy: () => String(legacyPerpMaxLeverage(mr)),
		next: () =>
			String(exactLeverageFromMarginRatio(mr, 2, legacyPerpMaxLeverage(mr))),
	});
}

// The spot-market call site derives its margin ratio as
// `initialLiabilityWeight - 10000` before dividing, which is what
// reintroduces the float subtraction error below.
const liabilityWeightCases: CorpusCase[] = [];
for (let lw = 10001; lw <= 30000; lw++) {
	liabilityWeightCases.push({
		key: `lw=${lw}`,
		legacy: () => String(legacySpotMaxLeverage(lw)),
		next: () =>
			String(
				exactLeverageFromMarginRatio(lw - 10000, 2, legacySpotMaxLeverage(lw))
			),
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

// A handful of exact ties at decimals other than 2, direct on the helper.
const decimalsCases: CorpusCase[] = [
	[800, 0],
	[4000, 0],
	[1600, 1],
	[2560, 4],
].map(([mr, decimals]) => ({
	key: `mr=${mr},decimals=${decimals}`,
	legacy: () => String(parseFloat((1 / (mr / 10000)).toFixed(decimals))),
	next: () =>
		String(
			exactLeverageFromMarginRatio(
				mr,
				decimals,
				parseFloat((1 / (mr / 10000)).toFixed(decimals))
			)
		),
}));

// Inputs the exact path cannot handle (non-positive-integer marginRatio, or
// a non-integer/negative `decimals`): the guard must fall back to the legacy
// value it's handed rather than throw.
const guardCases: CorpusCase[] = [
	{
		key: 'convertMarginRatioToLeverage(-100,2)',
		legacy: () => String(legacyConvertMarginRatioToLeverage(-100, 2)),
		next: () => String(convertMarginRatioToLeverage(-100, 2)),
	},
	{
		key: 'convertMarginRatioToLeverage(3333.5,2)',
		legacy: () => String(legacyConvertMarginRatioToLeverage(3333.5, 2)),
		next: () => String(convertMarginRatioToLeverage(3333.5, 2)),
	},
	{
		key: 'convertMarginRatioToLeverage(3200,1.5)',
		legacy: () => String(legacyConvertMarginRatioToLeverage(3200, 1.5)),
		next: () => String(convertMarginRatioToLeverage(3200, 1.5)),
	},
	{
		key: 'exactLeverageFromMarginRatio(0,2,legacy)',
		legacy: () => 'Infinity',
		next: () => String(exactLeverageFromMarginRatio(0, 2, Infinity)),
	},
	{
		key: 'getMaxLeverageForMarketAccount(perp, marginRatioInitial=3333.5)',
		legacy: () => String(legacyPerpMaxLeverage(3333.5)),
		next: () =>
			String(
				getMaxLeverageForMarketAccount(MarketType.PERP, {
					marginRatioInitial: 3333.5,
				} as PerpMarketAccount).maxLeverage
			),
	},
	{
		key: 'getMaxLeverageForMarketAccount(spot, initialLiabilityWeight=13200.5)',
		legacy: () => String(legacySpotMaxLeverage(13200.5)),
		next: () =>
			String(
				getMaxLeverageForMarketAccount(MarketType.SPOT, {
					initialLiabilityWeight: 13200.5,
				} as SpotMarketAccount).maxLeverage
			),
	},
	// At exactly full weight the spot branch returns the legacy value directly
	// (Infinity) instead of dividing by zero.
	{
		key: 'getMaxLeverageForMarketAccount(spot, initialLiabilityWeight=10000)',
		legacy: () => String(legacySpotMaxLeverage(10000)),
		next: () =>
			String(
				getMaxLeverageForMarketAccount(MarketType.SPOT, {
					initialLiabilityWeight: 10000,
				} as SpotMarketAccount).maxLeverage
			),
	},
	// Below full weight the spot branch also returns the legacy value directly
	// (today's negative value) rather than the exact path.
	{
		key: 'getMaxLeverageForMarketAccount(spot, initialLiabilityWeight=9000)',
		legacy: () => String(legacySpotMaxLeverage(9000)),
		next: () =>
			String(
				getMaxLeverageForMarketAccount(MarketType.SPOT, {
					initialLiabilityWeight: 9000,
				} as SpotMarketAccount).maxLeverage
			),
	},
	// No account at all falls back to initialLiabilityWeight=0, which is also
	// at-or-below full weight.
	{
		key: 'getMaxLeverageForMarketAccount(spot, undefined account)',
		legacy: () => String(legacySpotMaxLeverage(0)),
		next: () =>
			String(
				getMaxLeverageForMarketAccount(
					MarketType.SPOT,
					undefined as unknown as SpotMarketAccount
				).maxLeverage
			),
	},
];

describe('exactLeverageFromMarginRatio', () => {
	it('matches the old float expression for every margin ratio from 1 to 10000', () => {
		runCorpus(marginRatioCases, {});
	});

	it('matches the old spot-market expression for every liability weight from 10001 to 30000, except two exact ties', () => {
		runCorpus(liabilityWeightCases, LIABILITY_WEIGHT_DIVERGENCES);
	});

	it('matches the old expression at decimals other than 2', () => {
		runCorpus(decimalsCases, {});
	});

	it('falls back to the legacy value instead of throwing outside a positive integer marginRatio and a non-negative integer decimals', () => {
		runCorpus(guardCases, {});
	});

	it('falls back to MARGIN_PRECISION/DEFAULT_MAX_MARKET_LEVERAGE when marginRatioInitial is unset', () => {
		const { maxLeverage } = getMaxLeverageForMarketAccount(
			MarketType.PERP,
			{} as PerpMarketAccount
		);
		// DEFAULT_MAX_MARKET_LEVERAGE is 10, so the fallback margin ratio is
		// MARGIN_PRECISION / 10 = 1000, an integer the exact path takes cleanly.
		expect(maxLeverage).to.equal(legacyPerpMaxLeverage(1000));
	});
});

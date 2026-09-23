import { BigNum, BN, PRICE_PRECISION_EXP } from '@velocity-exchange/sdk';
import {
	getTotalBorrowsForMarket,
	getTotalDepositsForMarket,
} from '../../src/utils/markets/balances';
import { CorpusCase, Divergence, runCorpus } from './divergence';
import {
	makeClient,
	spotMarketConfigFor,
} from './fixtures/marketTotalsFixtures';

/**
 * Characterization corpus for `getTotalBorrowsForMarket` and
 * `getTotalDepositsForMarket`: `legacy*` reproduces the float arithmetic as it
 * stood before the fix (`price.toNum() * amount.toNum()`, `.toFixed(2)` for
 * borrows), applied to the same price/token-amount pair the real function
 * computes internally. `next` calls the real, fixed function through a
 * stubbed `VelocityClient`. Every disagreement over the sweep below is
 * listed and annotated; an unlisted or unused one fails the build.
 */

const legacyBorrows = (
	priceRaw: number | BN,
	amountRaw: number | BN,
	decimals: number
) => {
	const price = BigNum.from(new BN(priceRaw), PRICE_PRECISION_EXP);
	const amount = BigNum.from(new BN(amountRaw), new BN(decimals));
	const totalBorrowsQuote = price.toNum() * amount.toNum();
	return Number(totalBorrowsQuote.toFixed(2));
};

const legacyDeposits = (
	priceRaw: number | BN,
	amountRaw: number | BN,
	decimals: number
) => {
	const price = BigNum.from(new BN(priceRaw), PRICE_PRECISION_EXP);
	const amount = BigNum.from(new BN(amountRaw), new BN(decimals));
	return price.toNum() * amount.toNum();
};

const nextBorrows = (
	priceRaw: number | BN,
	amountRaw: number,
	decimals: number
) =>
	getTotalBorrowsForMarket(
		spotMarketConfigFor(decimals),
		makeClient({ decimals, borrowRaw: amountRaw, priceRaw })
	);

const nextDeposits = (
	priceRaw: number | BN,
	amountRaw: number,
	decimals: number
) =>
	getTotalDepositsForMarket(
		spotMarketConfigFor(decimals),
		makeClient({ decimals, depositRaw: amountRaw, priceRaw })
	).totalDepositsQuote;

// Realistic 6dp oracle prices: a sub-dollar token, a $1 stable, a price with a
// full set of non-zero digits, a value just under $1, a five-figure price
// (BTC-like), the cent-tie price used in marketTotals.test.ts, and a price
// with no trailing zero anywhere.
const PRICES = [
	500_000, 1_000_000, 1_234_567, 999_999, 25_000_000_000, 1_740_000, 45_678_912,
];

// Token amounts at 9dp (e.g. SOL) and 6dp (e.g. USDC), spanning zero, one raw
// unit, a whole token, and several amounts with a full digit spread.
const AMOUNTS_9DP = [
	0, 1, 1_000_000_000, 123_456_789, 987_654_321, 500_000_000, 250_000_000,
	111_111_111,
];
const AMOUNTS_6DP = [
	0, 1, 1_000_000, 123_456, 987_654, 500_000, 250_000, 999_999,
];

const REPRESENTATION =
	'the double holding price.toNum() * amount.toNum() lands a hair off an exact cent tie, so the old .toFixed(2) truncated the tie down instead of rounding it';

const EXACT_PRODUCT =
	'the float product either fabricates digits past the exact terminating decimal or loses them, where exact BigNum multiplication does neither';

const borrowsCases: CorpusCase[] = [];
const depositsCases: CorpusCase[] = [];

for (const price of PRICES) {
	for (const amount of AMOUNTS_9DP) {
		const key = `${price} price / 9dp amount ${amount}`;
		borrowsCases.push({
			key,
			legacy: () => String(legacyBorrows(price, amount, 9)),
			next: () => String(nextBorrows(price, amount, 9)),
		});
		depositsCases.push({
			key,
			legacy: () => String(legacyDeposits(price, amount, 9)),
			next: () => String(nextDeposits(price, amount, 9)),
		});
	}
	for (const amount of AMOUNTS_6DP) {
		const key = `${price} price / 6dp amount ${amount}`;
		borrowsCases.push({
			key,
			legacy: () => String(legacyBorrows(price, amount, 6)),
			next: () => String(nextBorrows(price, amount, 6)),
		});
		depositsCases.push({
			key,
			legacy: () => String(legacyDeposits(price, amount, 6)),
			next: () => String(nextDeposits(price, amount, 6)),
		});
	}
}

const tie = (old: string, next: string): Divergence => ({
	behaviour: REPRESENTATION,
	old,
	next,
});
const exact = (old: string, next: string): Divergence => ({
	behaviour: EXACT_PRODUCT,
	old,
	next,
});

const BORROW_DIVERGENCES: Record<string, Divergence> = {
	'25000000000 price / 6dp amount 1': tie('0.02', '0.03'),
	'25000000000 price / 6dp amount 999999': tie('24999.97', '24999.98'),
	'1740000 price / 9dp amount 250000000': tie('0.43', '0.44'),
	'1740000 price / 6dp amount 250000': tie('0.43', '0.44'),
};

const DEPOSIT_DIVERGENCES: Record<string, Divergence> = {
	'1234567 price / 9dp amount 123456789': exact(
		'0.15241567762536298',
		'0.152415677625363'
	),
	'1234567 price / 6dp amount 123456': exact(
		'0.15241470355199999',
		'0.152414703552'
	),
	'1234567 price / 6dp amount 987654': exact(
		'1.2193250358180001',
		'1.219325035818'
	),
	'999999 price / 9dp amount 111111111': exact(
		'0.11111099988888899',
		'0.111110999888889'
	),
	'999999 price / 6dp amount 123456': exact(
		'0.12345587654399999',
		'0.123455876544'
	),
	'999999 price / 6dp amount 999999': exact(
		'0.9999980000009999',
		'0.999998000001'
	),
	'25000000000 price / 9dp amount 123456789': exact(
		'3086.4197249999997',
		'3086.419725'
	),
	'25000000000 price / 9dp amount 987654321': exact(
		'24691.358024999998',
		'24691.358025'
	),
	'25000000000 price / 6dp amount 1': exact('0.024999999999999998', '0.025'),
	'25000000000 price / 6dp amount 987654': exact(
		'24691.350000000002',
		'24691.35'
	),
	'1740000 price / 9dp amount 1': exact('1.7400000000000002e-9', '1.74e-9'),
	'1740000 price / 9dp amount 123456789': exact(
		'0.21481481285999998',
		'0.21481481286'
	),
	'1740000 price / 9dp amount 987654321': exact(
		'1.7185185185399998',
		'1.71851851854'
	),
	'1740000 price / 6dp amount 1': exact(
		'0.0000017399999999999999',
		'0.00000174'
	),
	'45678912 price / 9dp amount 123456789': exact(
		'5.639371800533567',
		'5.639371800533568'
	),
	'45678912 price / 9dp amount 987654321': exact(
		'45.114974815378744',
		'45.11497481537875'
	),
	'45678912 price / 6dp amount 1': exact(
		'0.000045678911999999993',
		'0.000045678912'
	),
	'45678912 price / 6dp amount 123456': exact(
		'5.639335759871999',
		'5.639335759872'
	),
	'45678912 price / 6dp amount 999999': exact(
		'45.678866321087995',
		'45.678866321088'
	),
};

describe('getTotalBorrowsForMarket divergence map', () => {
	it('reproduces the float rounding except at the annotated cent ties', () => {
		runCorpus(borrowsCases, BORROW_DIVERGENCES);
	});
});

describe('getTotalDepositsForMarket divergence map', () => {
	it('reproduces the float product except at the annotated exact-product fixes', () => {
		runCorpus(depositsCases, DEPOSIT_DIVERGENCES);
	});
});

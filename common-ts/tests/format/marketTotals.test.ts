import { expect } from 'chai';
import {
	BN,
	SpotMarketAccount,
	SpotMarketConfig,
	VelocityClient,
} from '@velocity-exchange/sdk';
import {
	getTotalBorrowsForMarket,
	getTotalDepositsForMarket,
} from '../../src/utils/markets/balances';

const DECIMALS = 9;
// SPOT_MARKET_CUMULATIVE_INTEREST_PRECISION: no accrued interest, so
// getTokenAmount returns the balance unchanged.
const NO_INTEREST = new BN(10_000_000_000);

const spotMarketConfig = {
	marketIndex: 0,
	precisionExp: new BN(DECIMALS),
} as unknown as SpotMarketConfig;

const makeClient = (params: {
	borrowBalance: BN;
	depositBalance: BN;
	priceRaw: BN;
}): VelocityClient => {
	const spotMarketAccount = {
		decimals: DECIMALS,
		borrowBalance: params.borrowBalance,
		depositBalance: params.depositBalance,
		cumulativeBorrowInterest: NO_INTEREST,
		cumulativeDepositInterest: NO_INTEREST,
		oracle: {},
		oracleSource: {},
	} as unknown as SpotMarketAccount;

	return {
		getSpotMarketAccountOrThrow: () => spotMarketAccount,
		getOraclePriceDataAndSlot: () => ({
			data: { price: params.priceRaw },
			slot: 0,
		}),
	} as unknown as VelocityClient;
};

describe('markets/balances total quote value', () => {
	it('borrows: half-up rounds an exact cent tie instead of truncating a float', () => {
		// 1.74 (6dp price) * 0.25 (9dp amount) = 0.435 exactly, a cent tie.
		// price.toNum() * amount.toNum() is 0.43499999999999994 as a double, so
		// the old `.toFixed(2)` truncated it down to 0.43. Exact arithmetic sees
		// the true tie and half-up rounds it to 0.44.
		const client = makeClient({
			borrowBalance: new BN(250_000_000),
			depositBalance: new BN(0),
			priceRaw: new BN(1_740_000),
		});

		expect(getTotalBorrowsForMarket(spotMarketConfig, client)).to.equal(0.44);
	});

	it('deposits: returns the exact quote value, not float multiplication noise', () => {
		// 1.234567 (6dp price) * 0.987654321 (9dp amount) is exact at 15 digits.
		// price.toNum() * amount.toNum() is 1.219325432114007, noise below
		// QUOTE_PRECISION_EXP that exact BigNum multiplication never produces.
		const client = makeClient({
			borrowBalance: new BN(0),
			depositBalance: new BN(987_654_321),
			priceRaw: new BN(1_234_567),
		});

		const result = getTotalDepositsForMarket(spotMarketConfig, client);
		expect(result.totalDepositsBase).to.equal(0.987654321);
		expect(result.totalDepositsQuote).to.equal(1.219325);
	});
});

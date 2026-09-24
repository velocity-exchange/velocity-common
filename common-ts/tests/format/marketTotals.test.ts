import { expect } from 'chai';
import { BN } from '@velocity-exchange/sdk';
import {
	getTotalBorrowsForMarket,
	getTotalDepositsForMarket,
} from '../../src/utils/markets/balances';
import {
	makeClient,
	spotMarketConfigFor,
} from './fixtures/marketTotalsFixtures';

const spotMarketConfig = spotMarketConfigFor(9);

describe('markets/balances total quote value', () => {
	it('borrows: half-up rounds an exact cent tie instead of truncating a float', () => {
		// 1.74 (6dp price) * 0.25 (9dp amount) = 0.435 exactly, a cent tie.
		// price.toNum() * amount.toNum() is 0.43499999999999994 as a double, so
		// the old `.toFixed(2)` truncated it down to 0.43. Exact arithmetic sees
		// the true tie and half-up rounds it to 0.44.
		const client = makeClient({
			decimals: 9,
			borrowRaw: 250_000_000,
			priceRaw: 1_740_000,
		});

		expect(getTotalBorrowsForMarket(spotMarketConfig, client)).to.equal(0.44);
	});

	it('deposits: returns the exact quote product, with every digit float multiplication drops', () => {
		// 1.234567 (6dp price) * 0.123456789 (9dp amount) is exact at 15 digits:
		// 0.152415677625363. price.toNum() * amount.toNum() is the double
		// 0.15241567762536298 instead: real digits the float multiply cannot
		// hold, not "noise" layered on top of a correct answer. The fix must
		// return the exact product unshifted, not truncated to QUOTE_PRECISION_EXP
		// first (that would silently zero everything past the 6th decimal).
		const client = makeClient({
			decimals: 9,
			depositRaw: 123_456_789,
			priceRaw: 1_234_567,
		});

		const result = getTotalDepositsForMarket(spotMarketConfig, client);
		expect(result.totalDepositsBase).to.equal(0.123456789);
		expect(result.totalDepositsQuote).to.equal(0.152415677625363);
	});

	it('borrows: a zero balance rounds to zero', () => {
		const client = makeClient({
			decimals: 9,
			borrowRaw: 0,
			priceRaw: 1_740_000,
		});

		expect(getTotalBorrowsForMarket(spotMarketConfig, client)).to.equal(0);
	});

	it('deposits: a zero balance returns zero for both fields', () => {
		const client = makeClient({
			decimals: 9,
			depositRaw: 0,
			priceRaw: 1_740_000,
		});

		const result = getTotalDepositsForMarket(spotMarketConfig, client);
		expect(result.totalDepositsBase).to.equal(0);
		expect(result.totalDepositsQuote).to.equal(0);
	});

	it('borrows: a negative oracle price carries its sign through exactly', () => {
		const client = makeClient({
			decimals: 9,
			borrowRaw: 250_000_000,
			priceRaw: -1_740_000,
		});

		expect(getTotalBorrowsForMarket(spotMarketConfig, client)).to.equal(-0.44);
	});

	it('deposits: a negative oracle price carries its sign through exactly', () => {
		const client = makeClient({
			decimals: 9,
			depositRaw: 123_456_789,
			priceRaw: -1_234_567,
		});

		const result = getTotalDepositsForMarket(spotMarketConfig, client);
		expect(result.totalDepositsQuote).to.equal(-0.152415677625363);
	});

	it('throws instead of returning a broken number when the combined precision overflows', () => {
		// Synthetic: no real spot market carries a negative precisionExp, but
		// unlike a precision above 100 (which BigNum.from itself refuses),
		// nothing stops a very negative one from reaching this far. Combined
		// with the 6dp price it pushes the scale past MAX_EXPONENT_SHIFT, which
		// exercises the guard added when the float multiplication was replaced
		// with exact BigNum arithmetic.
		const overflowConfig = spotMarketConfigFor(new BN(-10_007));
		const client = makeClient({
			decimals: 9,
			borrowRaw: 250_000_000,
			priceRaw: 1_740_000,
		});

		expect(() => getTotalBorrowsForMarket(overflowConfig, client)).to.throw(
			/not a finite value/
		);
	});
});

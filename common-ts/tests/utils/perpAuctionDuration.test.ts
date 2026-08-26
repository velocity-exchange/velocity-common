import {
	BN,
	ContractTier,
	PRICE_PRECISION,
	SLOT_DURATION_BASELINE,
	SlotDurationMs,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { getPerpAuctionDuration } from '../../src/utils/orders/flags';
import {
	DEFAULT_LIMIT_AUCTION_DURATION,
	DEFAULT_LIMIT_AUCTION_DURATION_MS,
	DEFAULT_MARKET_AUCTION_DURATION,
	DEFAULT_MARKET_AUCTION_DURATION_MS,
	getDefaultLimitAuctionDurationSlots,
	getDefaultMarketAuctionDurationSlots,
} from '../../src/velocity/base/constants/auction';

const GATES = [400, 350, 300, 250, 200] as SlotDurationMs[];

const PRICE = new BN(100).mul(PRICE_PRECISION);

const duration = (priceDiff: BN, slotDuration: SlotDurationMs) =>
	getPerpAuctionDuration(priceDiff, PRICE, ContractTier.C, slotDuration);

describe('getPerpAuctionDuration', () => {
	// Values pinned by the program's own suite in
	// programs/velocity/src/state/order_params/tests.rs.
	describe('matches the program at the 400ms baseline', () => {
		const cases: [BN, number][] = [
			[new BN(0), 1],
			[PRICE_PRECISION.divn(10), 6],
			[PRICE_PRECISION.divn(2), 30],
			[PRICE_PRECISION, 60],
			[PRICE_PRECISION.muln(2), 120],
			[PRICE_PRECISION.muln(3), 180],
		];

		cases.forEach(([priceDiff, expected]) => {
			it(`grants ${expected} slots for a price diff of ${priceDiff.toString()}`, () => {
				expect(duration(priceDiff, SLOT_DURATION_BASELINE)).to.equal(expected);
			});
		});
	});

	it('grants 100 steps per percent for the safest tiers', () => {
		expect(
			getPerpAuctionDuration(
				PRICE_PRECISION,
				PRICE,
				ContractTier.A,
				SLOT_DURATION_BASELINE
			)
		).to.equal(100);
		expect(
			getPerpAuctionDuration(
				PRICE_PRECISION,
				PRICE,
				ContractTier.B,
				SLOT_DURATION_BASELINE
			)
		).to.equal(100);
	});

	// A 2% diff at tier C is 120 steps x 400ms = 48s.
	describe('scales the slot count so the wall-clock ramp is constant', () => {
		const expectedByGate: [SlotDurationMs, number][] = [
			[400 as SlotDurationMs, 120],
			[350 as SlotDurationMs, 138],
			[300 as SlotDurationMs, 160],
			[250 as SlotDurationMs, 192],
			[200 as SlotDurationMs, 240],
		];

		expectedByGate.forEach(([slotDuration, expected]) => {
			it(`grants ${expected} slots at ${slotDuration}ms`, () => {
				const slots = duration(PRICE_PRECISION.muln(2), slotDuration);
				expect(slots).to.equal(expected);
				expect(slots * slotDuration).to.be.at.least(48_000);
				expect(slots * slotDuration).to.be.below(48_000 + slotDuration);
			});
		});
	});

	// The 180-step (72s) maximum inflates past the u8 ceiling at the fastest gates.
	describe('clamps at the u8 auctionDuration ceiling', () => {
		it('is unclamped at 400ms and 350ms', () => {
			expect(duration(PRICE_PRECISION.muln(3), 400 as SlotDurationMs)).to.equal(
				180
			);
			expect(duration(PRICE_PRECISION.muln(3), 350 as SlotDurationMs)).to.equal(
				206
			);
		});

		it('clamps to 255 at 250ms and 200ms', () => {
			expect(duration(PRICE_PRECISION.muln(3), 250 as SlotDurationMs)).to.equal(
				255
			);
			expect(duration(PRICE_PRECISION.muln(3), 200 as SlotDurationMs)).to.equal(
				255
			);
		});

		it('never exceeds 255 at any gate for any price diff', () => {
			GATES.forEach((slotDuration) => {
				[0, 1, 5, 10, 100].forEach((multiple) => {
					expect(
						duration(PRICE_PRECISION.muln(multiple), slotDuration)
					).to.be.at.most(255);
				});
			});
		});
	});

	it('grants the one-step minimum as a wall-clock floor', () => {
		GATES.forEach((slotDuration) => {
			const slots = duration(new BN(0), slotDuration);
			expect(slots).to.be.at.least(1);
			expect(slots * slotDuration).to.be.at.least(400);
		});
	});
});

describe('default auction durations', () => {
	it('reproduces the legacy slot counts at the 400ms baseline', () => {
		expect(
			getDefaultLimitAuctionDurationSlots(SLOT_DURATION_BASELINE)
		).to.equal(DEFAULT_LIMIT_AUCTION_DURATION);
		expect(
			getDefaultMarketAuctionDurationSlots(SLOT_DURATION_BASELINE)
		).to.equal(DEFAULT_MARKET_AUCTION_DURATION);
	});

	it('holds its wall-clock length at every gate', () => {
		GATES.forEach((slotDuration) => {
			const limit = getDefaultLimitAuctionDurationSlots(slotDuration);
			expect(limit * slotDuration).to.be.at.least(
				DEFAULT_LIMIT_AUCTION_DURATION_MS
			);
			expect(limit * slotDuration).to.be.below(
				DEFAULT_LIMIT_AUCTION_DURATION_MS + slotDuration
			);

			const market = getDefaultMarketAuctionDurationSlots(slotDuration);
			expect(market * slotDuration).to.be.at.least(
				DEFAULT_MARKET_AUCTION_DURATION_MS
			);
			expect(market * slotDuration).to.be.below(
				DEFAULT_MARKET_AUCTION_DURATION_MS + slotDuration
			);
		});
	});

	it('never exceeds the u8 auctionDuration ceiling', () => {
		GATES.forEach((slotDuration) => {
			expect(getDefaultLimitAuctionDurationSlots(slotDuration)).to.be.at.most(
				255
			);
			expect(getDefaultMarketAuctionDurationSlots(slotDuration)).to.be.at.most(
				255
			);
		});
	});
});

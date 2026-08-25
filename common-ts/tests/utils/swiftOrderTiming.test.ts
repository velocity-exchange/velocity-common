import {
	BASE_PRECISION,
	getLimitOrderParams,
	getMarketOrderParams,
	MarketType,
	OptionalOrderParams,
	PositionDirection,
	PRICE_PRECISION,
	PublicKey,
	SlotDurationMs,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import {
	MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS,
	prepSwiftOrderMessage,
	USER_SIGNING_MESSAGE_BUFFER_MS,
} from '../../src/drift/base/actions/trade/openPerpOrder/openSwiftOrder';
import {
	getSwiftConfirmationTimeoutMs,
	SWIFT_CONFIRMATION_ROUND_TRIP_MS,
} from '../../src/utils/signedMsgs';
import { getDefaultMarketAuctionDurationSlots } from '../../src/drift/base/constants/auction';

const GATES = [400, 350, 300, 250, 200] as SlotDurationMs[];

const CURRENT_SLOT = 1_000_000;

const clientStub = () =>
	({
		connection: {
			getSlot: async () => CURRENT_SLOT,
		},
		encodeSignedMsgOrderParamsMessage: () => Buffer.from([1, 2, 3]),
	}) as unknown as VelocityClient;

const marketOrder = (auctionDuration: number): OptionalOrderParams =>
	getMarketOrderParams({
		marketIndex: 0,
		marketType: MarketType.PERP,
		direction: PositionDirection.LONG,
		baseAssetAmount: BASE_PRECISION,
		auctionDuration,
	});

const restingLimitOrder = (): OptionalOrderParams =>
	getLimitOrderParams({
		marketIndex: 0,
		marketType: MarketType.PERP,
		direction: PositionDirection.LONG,
		baseAssetAmount: BASE_PRECISION,
		price: PRICE_PRECISION,
	});

const timing = (main: OptionalOrderParams, slotDuration: SlotDurationMs) =>
	prepSwiftOrderMessage({
		velocityClient: clientStub(),
		subAccountId: 0,
		userAccountPubKey: PublicKey.default,
		marketIndex: 0,
		userSigningSlotBuffer: 0,
		slotDuration,
		orderParams: { main },
	});

describe('swift order timing', () => {
	it('reproduces the legacy windows at the 400ms baseline', async () => {
		const auction = await timing(marketOrder(20), 400 as SlotDurationMs);
		// 7 signing-buffer slots + 20 auction slots, less the 5-slot guard buffer.
		expect(auction.slotsTillAuctionEnd).to.equal(27);
		expect(auction.signingDeadlineSlot).to.equal(CURRENT_SLOT + 22);
		expect(auction.expirationTimeMs).to.equal(8_800);

		const nonAuction = await timing(restingLimitOrder(), 400 as SlotDurationMs);
		expect(nonAuction.slotsTillAuctionEnd).to.equal(35);
		expect(nonAuction.signingDeadlineSlot).to.equal(CURRENT_SLOT + 30);
		expect(nonAuction.expirationTimeMs).to.equal(12_000);
	});

	it('keeps the signing deadline inside the auction window at every gate', async () => {
		for (const slotDuration of GATES) {
			const mains = [
				marketOrder(getDefaultMarketAuctionDurationSlots(slotDuration)),
				marketOrder(1),
				restingLimitOrder(),
			];

			for (const main of mains) {
				const { slotsTillAuctionEnd, signingDeadlineSlot } = await timing(
					main,
					slotDuration
				);
				expect(signingDeadlineSlot).to.be.below(
					CURRENT_SLOT + slotsTillAuctionEnd
				);
			}
		}
	});

	it('keeps the deadline inside the window when a caller passes its own tiny buffer', async () => {
		// The minimum floor is 5 slots, so without a cap it outruns any window
		// shorter than that and the guard lets through an order that can no
		// longer fill. Only reachable when a caller supplies the buffer itself.
		for (const slotDuration of GATES) {
			const { slotsTillAuctionEnd, signingDeadlineSlot } =
				await prepSwiftOrderMessage({
					velocityClient: clientStub(),
					subAccountId: 0,
					userAccountPubKey: PublicKey.default,
					marketIndex: 0,
					userSigningSlotBuffer: 1,
					slotDuration,
					orderParams: { main: marketOrder(1) },
				});

			expect(slotsTillAuctionEnd).to.equal(2);
			expect(signingDeadlineSlot).to.be.below(
				CURRENT_SLOT + slotsTillAuctionEnd
			);
		}
	});

	it('holds the signing buffer wall-clock constant at every gate', async () => {
		for (const slotDuration of GATES) {
			const auctionSlots = getDefaultMarketAuctionDurationSlots(slotDuration);
			const { slotsTillAuctionEnd } = await timing(
				marketOrder(auctionSlots),
				slotDuration
			);

			const bufferMs = (slotsTillAuctionEnd - auctionSlots) * slotDuration;
			expect(bufferMs).to.be.at.least(USER_SIGNING_MESSAGE_BUFFER_MS);
			expect(bufferMs).to.be.below(
				USER_SIGNING_MESSAGE_BUFFER_MS + slotDuration
			);
		}
	});

	it('holds the non-auction approval budget wall-clock constant at every gate', async () => {
		for (const slotDuration of GATES) {
			const { slotsTillAuctionEnd } = await timing(
				restingLimitOrder(),
				slotDuration
			);

			const budgetMs = slotsTillAuctionEnd * slotDuration;
			expect(budgetMs).to.be.at.least(
				MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS
			);
			expect(budgetMs).to.be.below(
				MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS + slotDuration
			);
		}
	});

	it('expresses the signing window in ms at the live duration', async () => {
		for (const slotDuration of GATES) {
			const { signingDeadlineSlot, expirationTimeMs } = await timing(
				marketOrder(getDefaultMarketAuctionDurationSlots(slotDuration)),
				slotDuration
			);
			expect(expirationTimeMs).to.equal(
				(signingDeadlineSlot - CURRENT_SLOT) * slotDuration
			);
		}
	});
});

describe('getSwiftConfirmationTimeoutMs', () => {
	it('reproduces the legacy timeout at the 400ms baseline', () => {
		expect(
			getSwiftConfirmationTimeoutMs(27, undefined, 400 as SlotDurationMs)
		).to.equal((27 + 15) * 400);
	});

	it('holds its wall-clock length at every gate', () => {
		GATES.forEach((slotDuration) => {
			const auctionSlots = Math.ceil(20_000 / slotDuration);
			expect(
				getSwiftConfirmationTimeoutMs(auctionSlots, undefined, slotDuration)
			).to.be.at.least(20_000 + SWIFT_CONFIRMATION_ROUND_TRIP_MS);
			expect(
				getSwiftConfirmationTimeoutMs(auctionSlots, undefined, slotDuration)
			).to.be.below(20_000 + SWIFT_CONFIRMATION_ROUND_TRIP_MS + slotDuration);
		});
	});

	it('applies the multiplier to the whole budget', () => {
		expect(
			getSwiftConfirmationTimeoutMs(10, 2, 200 as SlotDurationMs)
		).to.equal((10 * 200 + SWIFT_CONFIRMATION_ROUND_TRIP_MS) * 2);
	});
});

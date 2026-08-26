import { msToSlotsCeilNum, SlotDurationMs } from '@velocity-exchange/sdk';

/** `Order.auctionDuration` is a u8, so an inflated ramp clamps here. */
export const MAX_AUCTION_DURATION_SLOTS = 255;

/** Default limit-auction ramp. */
export const DEFAULT_LIMIT_AUCTION_DURATION_MS = 24_000;

/**
 * Default market/oracle auction ramp used when the caller does not supply one.
 * Mirrors the DLOB server's default so the network-free fallback tiers (L2,
 * vAMM) produce a non-null duration. A null/0 duration on a signed-message
 * order is rejected by the swift server with `InvalidOrderAuction`.
 */
export const DEFAULT_MARKET_AUCTION_DURATION_MS = 8_000;

export const getDefaultLimitAuctionDurationSlots = (
	slotDuration: SlotDurationMs
): number =>
	Math.min(
		msToSlotsCeilNum(DEFAULT_LIMIT_AUCTION_DURATION_MS, slotDuration),
		MAX_AUCTION_DURATION_SLOTS
	);

export const getDefaultMarketAuctionDurationSlots = (
	slotDuration: SlotDurationMs
): number =>
	Math.min(
		msToSlotsCeilNum(DEFAULT_MARKET_AUCTION_DURATION_MS, slotDuration),
		MAX_AUCTION_DURATION_SLOTS
	);

/**
 * @deprecated A slot count fixed at the 400ms baseline. Use
 * {@link getDefaultLimitAuctionDurationSlots} with the live slot duration.
 */
export const DEFAULT_LIMIT_AUCTION_DURATION = 60;

/**
 * @deprecated A slot count fixed at the 400ms baseline. Use
 * {@link getDefaultMarketAuctionDurationSlots} with the live slot duration.
 */
export const DEFAULT_MARKET_AUCTION_DURATION = 20;

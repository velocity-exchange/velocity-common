import { SlotDurationMs, slotsToMsNum } from '@velocity-exchange/sdk';

/**
 * Allowance on top of the placement window for the send + websocket confirmation
 * round trip. A wall-clock network budget, not a slot count.
 */
export const SWIFT_CONFIRMATION_ROUND_TRIP_MS = 6_000;

export function getSwiftConfirmationTimeoutMs(
	slotsTillPlacementDeadline: number,
	multiplier: number | undefined,
	slotDuration: SlotDurationMs
): number {
	const baseMs =
		slotsToMsNum(slotsTillPlacementDeadline, slotDuration) +
		SWIFT_CONFIRMATION_ROUND_TRIP_MS;
	return baseMs * (multiplier ?? 1);
}

/**
 * Wall time after which the program no longer places an order prepped at `preppedAtMs`.
 * The message slot is read before `preppedAtMs`, so the real deadline is no later.
 */
export function getSwiftPlacementDeadlineMs(
	preppedAtMs: number,
	slotsTillPlacementDeadline: number,
	slotDuration: SlotDurationMs
): number {
	return preppedAtMs + slotsToMsNum(slotsTillPlacementDeadline, slotDuration);
}

/** A slow network delays only what the client sees, so the multiplier scales the margin. */
export function getSwiftConfirmationDeadlineMs(
	placementDeadlineMs: number,
	multiplier: number | undefined
): number {
	return (
		placementDeadlineMs + SWIFT_CONFIRMATION_ROUND_TRIP_MS * (multiplier ?? 1)
	);
}

import {
	BN,
	ContractTier,
	isOneOfVariant,
	MILLIS_UNIT,
	Millis,
	millisToSlotsCeil,
	PERCENTAGE_PRECISION,
	SlotDurationMs,
} from '@velocity-exchange/sdk';
import { MAX_AUCTION_DURATION_SLOTS } from '../../velocity/base/constants/auction';

const MIN_AUCTION_DURATION_STEPS = new BN(1);
const MAX_AUCTION_DURATION_STEPS = new BN(180);

/**
 * Mirrors the program's `get_auction_duration`. The ramp is granted in steps of
 * `MILLIS_UNIT` (the historical 400ms calibration of the per-1% rate), then
 * expressed in actual slots at the live duration so the wall-clock ramp is the
 * same at every slot-time gate.
 */
export function getPerpAuctionDuration(
	priceDiff: BN,
	price: BN,
	contractTier: ContractTier,
	slotDuration: SlotDurationMs
): number {
	const percentDiff = priceDiff.mul(PERCENTAGE_PRECISION).div(price);

	const stepsPerPercent = isOneOfVariant(contractTier, ['a', 'b'])
		? new BN(100)
		: new BN(60);

	const perPercent = PERCENTAGE_PRECISION.divn(100);
	const rawSteps = percentDiff
		.mul(stepsPerPercent)
		.add(perPercent.subn(1))
		.div(perPercent);

	const steps = BN.min(
		BN.max(rawSteps, MIN_AUCTION_DURATION_STEPS),
		MAX_AUCTION_DURATION_STEPS
	);

	const duration = MILLIS_UNIT.mul(steps) as Millis;

	return Math.min(
		millisToSlotsCeil(duration, slotDuration).toNumber(),
		MAX_AUCTION_DURATION_SLOTS
	);
}

import { BN, IDLE_TIME, SlotDurationMs, User } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { ACCOUNT_DELETION_HELPERS } from '../../src/actions/actionHelpers/accountDeletionHelpers';

const GATES = [400, 350, 300, 250, 200] as SlotDurationMs[];

const IDLE_TIME_MS = IDLE_TIME.toNumber();

const userLastActiveAt = (lastActiveSlot: number) =>
	({
		getUserAccountOrThrow: () => ({ lastActiveSlot: new BN(lastActiveSlot) }),
	}) as unknown as User;

const waitMinutes = (
	elapsedSlots: number,
	slotDuration: SlotDurationMs,
	currentSlot = 1_000_000
) =>
	ACCOUNT_DELETION_HELPERS.getIdleWaitTimeMinutes(
		userLastActiveAt(currentSlot - elapsedSlots),
		currentSlot,
		slotDuration
	);

describe('getIdleWaitTimeMinutes', () => {
	it('reproduces the legacy estimate at the 400ms baseline', () => {
		// 9000 slots was the pre-gate encoding of the one-hour idle window.
		expect(waitMinutes(0, 400 as SlotDurationMs)).to.equal(60);
		expect(waitMinutes(4500, 400 as SlotDurationMs)).to.equal(30);
		expect(waitMinutes(9000, 400 as SlotDurationMs)).to.equal(0);
	});

	it('reports the same wait for the same wall-clock inactivity at every gate', () => {
		// multiples of 42_000ms divide evenly into every gate's slot duration
		[0, 588_000, 1_512_000, 2_940_000].forEach((elapsedMs) => {
			const expected = Math.ceil((IDLE_TIME_MS - elapsedMs) / 60_000);
			GATES.forEach((slotDuration) => {
				expect(waitMinutes(elapsedMs / slotDuration, slotDuration)).to.equal(
					expected
				);
			});
		});
	});

	it('never under-states the remaining wall-clock wait', () => {
		GATES.forEach((slotDuration) => {
			for (let elapsedSlots = 0; elapsedSlots < 20_000; elapsedSlots += 137) {
				const remainingMs = Math.max(
					IDLE_TIME_MS - elapsedSlots * slotDuration,
					0
				);
				expect(waitMinutes(elapsedSlots, slotDuration) * 60_000).to.be.at.least(
					remainingMs
				);
			}
		});
	});

	it('clamps to zero once the window has elapsed', () => {
		GATES.forEach((slotDuration) => {
			expect(waitMinutes(1_000_000, slotDuration)).to.equal(0);
		});
	});

	it('treats a last-active slot ahead of the current slot as no elapsed time', () => {
		GATES.forEach((slotDuration) => {
			expect(waitMinutes(-500, slotDuration)).to.equal(
				Math.ceil(IDLE_TIME_MS / 60_000)
			);
		});
	});
});

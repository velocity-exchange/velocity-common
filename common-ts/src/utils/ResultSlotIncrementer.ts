/**
 * Utility class which makes sure that all results with a slot are only accepted if the slot is higher than the previous result
 * Enhanced to handle tab return scenarios and prevent "speed run" through queued messages
 */
import { logger } from './logger';

export class ResultSlotIncrementer {
	private resultIncrements = new Map<string | symbol, number>();
	private tabReturnTimestamp: number | null = null;
	private isInTabReturnMode = false;
	private tabReturnDebounceMs = 2000; // 2 seconds to filter old messages after tab return
	private maxSlotJumpThreshold = 100; // If slot jumps by more than this, consider it a "speed run" scenario

	/**
	 * Call this when the tab returns from being inactive to enable enhanced filtering
	 */
	handleTabReturn() {
		this.tabReturnTimestamp = Date.now();
		this.isInTabReturnMode = true;

		// Auto-disable tab return mode after debounce period
		setTimeout(() => {
			this.isInTabReturnMode = false;
			this.tabReturnTimestamp = null;
		}, this.tabReturnDebounceMs);
	}

	/**
	 * Check if we should reset state due to a large slot jump (indicating queued messages)
	 */
	private shouldResetDueToSlotJump(
		key: string | symbol,
		slot: number
	): boolean {
		const previous = this.resultIncrements.get(key);
		if (!previous) return false;

		const slotJump = slot - previous;
		return slotJump > this.maxSlotJumpThreshold;
	}

	/**
	 * Enhanced result handler that deals with tab return scenarios
	 */
	handleResult(key: string | symbol, slot: number, messageTimestamp?: number) {
		if (slot === undefined) {
			logger.warn('Caught undefined slot in ResultSlotIncrementer');
			return true;
		}

		// If we're in tab return mode, be more aggressive about filtering
		if (this.isInTabReturnMode && this.tabReturnTimestamp) {
			// If message timestamp is available and it's older than when tab returned, skip it
			if (messageTimestamp && messageTimestamp < this.tabReturnTimestamp) {
				return false;
			}

			// Check for large slot jumps that indicate queued messages
			if (this.shouldResetDueToSlotJump(key, slot)) {
				// Reset the previous slot to current - 1 so this message passes
				// This effectively "jumps" to the latest state
				this.resultIncrements.set(key, slot - 1);
			}
		}

		const previous = this.resultIncrements.get(key);

		if (!previous || slot >= previous) {
			this.resultIncrements.set(key, slot);
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Reset slot tracking for a specific key (useful when reestablishing connections)
	 */
	resetKey(key: string | symbol) {
		this.resultIncrements.delete(key);
	}

	/**
	 * Reset all tracking (useful on full reconnection)
	 */
	resetAll() {
		this.resultIncrements.clear();
		this.isInTabReturnMode = false;
		this.tabReturnTimestamp = null;
	}

	/**
	 * Configure the tab return behavior
	 */
	configureTabReturn(debounceMs: number, slotJumpThreshold: number) {
		this.tabReturnDebounceMs = debounceMs;
		this.maxSlotJumpThreshold = slotJumpThreshold;
	}
}

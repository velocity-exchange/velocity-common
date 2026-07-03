export const USDT_SPOT_MARKET_INDEX = 0;
export const SOL_SPOT_MARKET_INDEX = 1;

export const DEFAULT_MAX_MARKET_LEVERAGE = 10;

/**
 * Low-activity perp markets to hide from the UI.
 * Key = perp market index, Value = Unix timestamp (seconds) after which the market is hidden.
 * Before the timestamp: market is visible but a warning banner is shown.
 * After the timestamp: market is hidden from dropdowns (unless user has positions/orders/unsettled PnL).
 * Direct URL navigation (e.g. /TIA-PERP) is unaffected.
 */
export const HIDDEN_PERP_MARKET_INDEXES: ReadonlyMap<number, number> = new Map([
	// [5, 1772625600], // example: POL — 4 Mar 2026, 12:00 UTC
]);

import type {
	PerpMarketAccount,
	SpotMarketAccount,
} from '@velocity-exchange/sdk';
import { marketPrecisionFromSizes } from '../market';
import { MarketPrecision } from '../types';

// Mirrors of BASE_PRECISION_EXP and QUOTE_PRECISION_EXP. This module is
// `import type` only, so the SDK erases at compile time and the values cannot
// be imported.
const BASE_PRECISION_EXP = 9;
const QUOTE_PRECISION_EXP = 6;

/** Only module that references the SDK at all, and only as a type. */
export function marketPrecisionFromAccount(
	account: PerpMarketAccount | SpotMarketAccount,
	caps?: { maxPriceDecimals?: number; maxSizeDecimals?: number }
): MarketPrecision {
	return marketPrecisionFromSizes({
		tickSize: account.orderTickSize,
		tickPrecisionExp: QUOTE_PRECISION_EXP,
		stepSize: account.orderStepSize,
		stepPrecisionExp: BASE_PRECISION_EXP,
		maxPriceDecimals: caps?.maxPriceDecimals,
		maxSizeDecimals: caps?.maxSizeDecimals,
	});
}

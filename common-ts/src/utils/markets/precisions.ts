import {
	BASE_PRECISION_EXP,
	BN,
	PerpMarketAccount,
	QUOTE_PRECISION_EXP,
	SpotMarketAccount,
} from '@velocity-exchange/sdk';
import { stepFractionDigits } from '../../format/market';

/**
 * Converts a size and precision exponent to the number of decimals in the size.
 * Size can refer to the step size or the tick size of a market.
 *
 * @deprecated Use `stepFractionDigits` or `marketPrecisionFromSizes` from
 * `@velocity-exchange/common/format`.
 *
 * The old implementation counted the decimals in `BigNum.prettyPrint()`, so the
 * result depended on the module-global `BigNum.delim`: one `BigNum.setLocale`
 * call anywhere in the process moved the separator and this returned 0.
 */
export const getDecimalsFromSize = (size: BN, precisionExp: BN) =>
	stepFractionDigits({ raw: size, scale: precisionExp });

export const getPerpMarketSizes = (perpMarketAccount: PerpMarketAccount) => {
	const stepSize = perpMarketAccount.orderStepSize;
	const tickSize = perpMarketAccount.orderTickSize;

	return {
		stepSizeDecimals: getDecimalsFromSize(stepSize, BASE_PRECISION_EXP),
		tickSizeDecimals: getDecimalsFromSize(tickSize, QUOTE_PRECISION_EXP),
	};
};

export const getSpotMarketSizes = (spotMarketAccount: SpotMarketAccount) => {
	const stepSize = spotMarketAccount.orderStepSize;
	const tickSize = spotMarketAccount.orderTickSize;

	return {
		stepSizeDecimals: getDecimalsFromSize(stepSize, BASE_PRECISION_EXP),
		tickSizeDecimals: getDecimalsFromSize(tickSize, QUOTE_PRECISION_EXP),
	};
};

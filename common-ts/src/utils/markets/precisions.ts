import {
	BASE_PRECISION_EXP,
	PerpMarketAccount,
	QUOTE_PRECISION_EXP,
} from '@velocity-exchange/sdk';
import { stepFractionDigits } from '../../format/market';

export const getPerpMarketSizes = (perpMarketAccount: PerpMarketAccount) => {
	const stepSize = perpMarketAccount.orderStepSize;
	const tickSize = perpMarketAccount.orderTickSize;

	return {
		stepSizeDecimals: stepFractionDigits({
			raw: stepSize,
			scale: BASE_PRECISION_EXP,
		}),
		tickSizeDecimals: stepFractionDigits({
			raw: tickSize,
			scale: QUOTE_PRECISION_EXP,
		}),
	};
};

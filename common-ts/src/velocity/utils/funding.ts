import {
	BigNum,
	BN,
	PRICE_PRECISION,
	PRICE_PRECISION_EXP,
	FUNDING_RATE_BUFFER_PRECISION,
} from '@velocity-exchange/sdk';

export const getFundingRate = (rate: BN, oracleTwap: BN): number => {
	return (
		BigNum.from(
			rate.mul(PRICE_PRECISION.mul(new BN(100))).div(oracleTwap),
			PRICE_PRECISION_EXP
		).toNum() / FUNDING_RATE_BUFFER_PRECISION.toNumber()
	);
};

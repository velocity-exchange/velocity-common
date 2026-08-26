import {
	BASE_PRECISION_EXP,
	BigNum,
	VelocityClient,
} from '@velocity-exchange/sdk';

export const getMarketOpenInterest = (
	velocityClient: VelocityClient,
	marketIndex: number
): { longOpenInterest: BigNum; shortOpenInterest: BigNum } => {
	const perpMarketAccount =
		velocityClient.getPerpMarketAccountOrThrow(marketIndex);
	const longOpenInterest = BigNum.from(
		perpMarketAccount.baseAssetAmountLong,
		BASE_PRECISION_EXP
	);
	const shortOpenInterest = BigNum.from(
		perpMarketAccount.baseAssetAmountShort,
		BASE_PRECISION_EXP
	);
	return { longOpenInterest, shortOpenInterest };
};

import {
	BN,
	SpotMarketAccount,
	SpotMarketConfig,
	VelocityClient,
} from '@velocity-exchange/sdk';

// SPOT_MARKET_CUMULATIVE_INTEREST_PRECISION: real markets carry this baseline
// on cumulative interest when nothing has accrued yet.
export const NO_INTEREST = new BN(10_000_000_000);

export const spotMarketConfigFor = (
	precisionExp: number | BN
): SpotMarketConfig =>
	({
		marketIndex: 0,
		precisionExp: new BN(precisionExp),
	}) as unknown as SpotMarketConfig;

// getTokenAmount scales a balance (always carried at the fixed on-chain
// balance precision) down to the market's token decimals by `10^(19-decimals)`.
// At the no-interest baseline that collapses to `10^(9-decimals)`, so a
// balance of `tokenRawUnits * 10^(9-decimals)` round-trips to exactly
// `tokenRawUnits` token-precision units.
export const rawBalanceFor = (decimals: number, tokenRawUnits: number | BN) =>
	new BN(tokenRawUnits).mul(new BN(10).pow(new BN(9 - decimals)));

export const makeClient = (params: {
	decimals: number;
	borrowRaw?: number | BN;
	depositRaw?: number | BN;
	priceRaw: number | BN;
}): VelocityClient => {
	const spotMarketAccount = {
		decimals: params.decimals,
		borrowBalance: rawBalanceFor(params.decimals, params.borrowRaw ?? 0),
		depositBalance: rawBalanceFor(params.decimals, params.depositRaw ?? 0),
		cumulativeBorrowInterest: NO_INTEREST,
		cumulativeDepositInterest: NO_INTEREST,
		oracle: {},
		oracleSource: {},
	} as unknown as SpotMarketAccount;

	return {
		getSpotMarketAccountOrThrow: () => spotMarketAccount,
		getOraclePriceDataAndSlot: () => ({
			data: { price: new BN(params.priceRaw) },
			slot: 0,
		}),
	} as unknown as VelocityClient;
};

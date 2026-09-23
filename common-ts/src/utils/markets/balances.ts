import {
	BigNum,
	QUOTE_PRECISION_EXP,
	VelocityClient,
	getTokenAmount,
	PRICE_PRECISION_EXP,
	SpotBalanceType,
	SpotMarketConfig,
} from '@velocity-exchange/sdk';
import { roundToDecimals, toDecimal, toLossyNumber } from '../../format/core';

// Exact price * amount, truncated to QUOTE_PRECISION_EXP. The truncated digits
// are below the millionth of a dollar and never reach a cent-rounding decision.
const quoteValue = (price: BigNum, amount: BigNum) => {
	const parsed = toDecimal(price.mul(amount).shiftTo(QUOTE_PRECISION_EXP));
	if (parsed.status !== 'ok') {
		throw new Error('market price or amount is not a finite value');
	}
	return parsed.value;
};

export const getTotalBorrowsForMarket = (
	market: SpotMarketConfig,
	velocityClient: VelocityClient
) => {
	const marketAccount = velocityClient.getSpotMarketAccountOrThrow(
		market.marketIndex
	);

	const totalBorrowsTokenAmount = getTokenAmount(
		marketAccount.borrowBalance,
		marketAccount,
		SpotBalanceType.BORROW
	);

	const totalBorrowsAmountBigNum = BigNum.from(
		totalBorrowsTokenAmount,
		market.precisionExp
	);

	const priceData = velocityClient.getOraclePriceDataAndSlot(
		marketAccount.oracle,
		marketAccount.oracleSource
	)!;

	const price = BigNum.from(priceData.data.price, PRICE_PRECISION_EXP);

	return toLossyNumber(
		roundToDecimals(quoteValue(price, totalBorrowsAmountBigNum), 2, 'half-up')
	);
};

export const getTotalDepositsForMarket = (
	market: SpotMarketConfig,
	velocityClient: VelocityClient
) => {
	const marketAccount = velocityClient.getSpotMarketAccountOrThrow(
		market.marketIndex
	);

	const totalDepositsTokenAmount = getTokenAmount(
		marketAccount.depositBalance,
		marketAccount,
		SpotBalanceType.DEPOSIT
	);

	const totalDepositsTokenAmountBigNum = BigNum.from(
		totalDepositsTokenAmount,
		market.precisionExp
	);

	const priceData = velocityClient.getOraclePriceDataAndSlot(
		marketAccount.oracle,
		marketAccount.oracleSource
	)!;

	const price = BigNum.from(priceData.data.price, PRICE_PRECISION_EXP);

	const totalDepositsBase = totalDepositsTokenAmountBigNum.toNum();
	const totalDepositsQuote = toLossyNumber(
		quoteValue(price, totalDepositsTokenAmountBigNum)
	);

	return {
		totalDepositsBase,
		totalDepositsQuote,
	};
};

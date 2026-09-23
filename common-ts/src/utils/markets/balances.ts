import {
	BigNum,
	VelocityClient,
	getTokenAmount,
	PRICE_PRECISION_EXP,
	SpotBalanceType,
	SpotMarketConfig,
} from '@velocity-exchange/sdk';
import { roundToDecimals, toDecimal, toLossyNumber } from '../../format/core';

// The exact price * amount product at their combined precision. Never
// shifted or truncated here: deposits report every digit, and borrows round
// straight from this to the cent, so no intermediate scale can drop digits
// a rounding decision still needs.
const quoteValue = (price: BigNum, amount: BigNum) => {
	const parsed = toDecimal(price.mul(amount));
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

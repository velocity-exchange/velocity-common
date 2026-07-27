import {
	BigNum,
	VelocityClient,
	SpotBalanceType,
	SpotMarketConfig,
	TxParams,
	User,
	getTokenAmount,
	isVariant,
} from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { getTokenAddressForDepositAndWithdraw } from '../../../../utils/token';

interface CreateWithdrawIxParams {
	velocityClient: VelocityClient;
	user: User;
	amount: BigNum;
	spotMarketConfig: SpotMarketConfig;
	isBorrow?: boolean;
	isMax?: boolean;
}

export const createWithdrawIx = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	user,
	isBorrow,
	isMax,
}: CreateWithdrawIxParams): Promise<TransactionInstruction[]> => {
	const reduceOnly = !isBorrow;
	const spotMarketAccount = velocityClient.getSpotMarketAccountOrThrow(
		spotMarketConfig.marketIndex
	);

	let finalWithdrawAmount = amount;

	if (isMax && reduceOnly) {
		const spotPosition = user
			.getUserAccountOrThrow()
			.spotPositions.find(
				(position) => position.marketIndex === spotMarketConfig.marketIndex
			);

		// scaledBalance is interest-free and in SPOT_MARKET_BALANCE_PRECISION
		const depositTokenAmount =
			spotPosition && isVariant(spotPosition.balanceType, 'deposit')
				? BigNum.from(
						getTokenAmount(
							spotPosition.scaledBalance,
							spotMarketAccount,
							SpotBalanceType.DEPOSIT
						),
						spotMarketConfig.precisionExp
				  )
				: undefined;

		// Only over-estimate when the max closes out the whole deposit, to absorb interest
		// accrued before execution. A margin-bound max must be sent as-is, since the on-chain
		// reduceOnly clamp is non-strict while the margin check gating the withdraw is strict.
		if (
			depositTokenAmount?.gtZero() &&
			(amount.eqZero() || amount.gte(depositTokenAmount)) // a margin-bound max is expected to be less than the deposit amount, so should skip this over-estimation
		) {
			finalWithdrawAmount = BigNum.max(amount, depositTokenAmount).scale(2, 1);
		}
	}

	const authority = user.getUserAccountOrThrow().authority;
	const associatedDepositTokenAddress =
		await getTokenAddressForDepositAndWithdraw(spotMarketAccount, authority);

	const withdrawIxs = await velocityClient.getWithdrawalIxs(
		finalWithdrawAmount.val,
		spotMarketConfig.marketIndex,
		associatedDepositTokenAddress,
		reduceOnly,
		user.getUserAccountOrThrow().subAccountId
	);

	return withdrawIxs;
};

interface CreateWithdrawTxnParams extends CreateWithdrawIxParams {
	txParams?: TxParams;
}

export const createWithdrawTxn = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	user,
	isBorrow,
	isMax,
	txParams,
}: CreateWithdrawTxnParams): Promise<Transaction | VersionedTransaction> => {
	const withdrawIxs = await createWithdrawIx({
		velocityClient,
		amount,
		spotMarketConfig,
		user,
		isBorrow,
		isMax,
	});

	const withdrawTxn = await velocityClient.txHandler.buildTransaction({
		instructions: withdrawIxs,
		txVersion: 0,
		connection: velocityClient.connection,
		preFlightCommitment: 'confirmed',
		fetchAllMarketLookupTableAccounts:
			velocityClient.fetchAllLookupTableAccounts.bind(velocityClient),
		txParams,
	});

	return withdrawTxn;
};

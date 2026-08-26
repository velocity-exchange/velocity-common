import {
	BigNum,
	VelocityClient,
	SpotMarketConfig,
	TxParams,
	User,
} from '@velocity-exchange/sdk';
import {
	PublicKey,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { getTokenAddressForDepositAndWithdraw } from '../../../../utils/token';

interface CreateDepositIxParams {
	velocityClient: VelocityClient;
	user: User;
	amount: BigNum;
	spotMarketConfig: Pick<SpotMarketConfig, 'mint' | 'marketIndex'>;
	isMaxBorrowRepayment?: boolean;
	/**
	 * Optional external wallet to deposit from. If provided, the deposit will be made
	 * from this wallet instead of the user's authority wallet.
	 */
	externalWallet?: PublicKey;
}

/**
 * Creates transaction instructions for depositing a spot token.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will perform the deposit
 * @param amount - The amount to deposit (in BigNum format)
 * @param spotMarketConfig - The spot market configuration for the token being deposited
 * @param isMaxBorrowRepayment - Whether this deposit is for maximum borrow repayment (scales amount by 2x, set to reduce only)
 * @param externalWallet - Optional external wallet to deposit from (instead of user's authority wallet)
 *
 * @returns Promise resolving to an array of transaction instructions for the deposit
 */
export const createDepositIxs = async ({
	velocityClient,
	user,
	amount,
	spotMarketConfig,
	isMaxBorrowRepayment,
	externalWallet,
}: CreateDepositIxParams): Promise<TransactionInstruction[]> => {
	const authority = externalWallet ?? user.getUserAccountOrThrow().authority;
	const spotMarketAccount = velocityClient.getSpotMarketAccountOrThrow(
		spotMarketConfig.marketIndex
	);
	const associatedDepositTokenAddress =
		await getTokenAddressForDepositAndWithdraw(spotMarketAccount, authority);

	let finalDepositAmount = amount;

	if (isMaxBorrowRepayment) {
		// we over-estimate to ensure that there is no borrow dust left
		// since isMaxBorrowRepayment = reduceOnly, it is safe to over-estimate
		finalDepositAmount = finalDepositAmount.scale(2, 1);
	}

	const depositIxs = await velocityClient.getDepositTxnIx(
		finalDepositAmount.val,
		spotMarketConfig.marketIndex,
		associatedDepositTokenAddress,
		user.getUserAccountOrThrow().subAccountId,
		isMaxBorrowRepayment,
		externalWallet ? { authority: externalWallet } : undefined
	);

	return depositIxs;
};

interface CreateDepositTxnParams extends CreateDepositIxParams {
	txParams?: TxParams;
	initSwiftAccount?: boolean;
}

/**
 * Creates a complete transaction for depositing assets into a spot market.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will perform the deposit
 * @param amount - The amount to deposit (in BigNum format)
 * @param spotMarketConfig - The spot market configuration for the token being deposited
 * @param isMaxBorrowRepayment - Whether this deposit is for maximum borrow repayment (scales amount by 2x)
 * @param txParams - Optional transaction parameters for building the transaction (compute units, priority fees, etc.)
 * @param initSwiftAccount - Optional flag to initialize a Swift account during the deposit
 * @param externalWallet - Optional external wallet to deposit from (instead of user's authority wallet)
 *
 * @returns Promise resolving to a built transaction ready for signing (Transaction or VersionedTransaction)
 */
export const createDepositTxn = async ({
	velocityClient,
	user,
	amount,
	spotMarketConfig,
	isMaxBorrowRepayment,
	txParams,
	initSwiftAccount: _initSwiftAccount,
	externalWallet,
}: CreateDepositTxnParams): Promise<Transaction | VersionedTransaction> => {
	// createDepositIxs owns the isMaxBorrowRepayment over-estimation; scaling here too
	// would double it
	// we choose to not use createDepositIxs here because it doesn't have the initSwiftAccount logic
	// const depositTxn = await velocityClient.createDepositTxn(
	// 	finalDepositAmount.val,
	// 	spotMarketConfig.marketIndex,
	// 	associatedDepositTokenAddress,
	// 	user.getUserAccount().subAccountId,
	// 	isMaxBorrowRepayment,
	// 	txParams,
	// 	initSwiftAccount
	// );
	const depositIxs = await createDepositIxs({
		velocityClient,
		user,
		amount,
		spotMarketConfig,
		isMaxBorrowRepayment,
		externalWallet,
	});

	// Wrapper to filter out null lookup tables from the velocityClient
	const fetchFilteredLookupTables = async () => {
		const lookupTables = await velocityClient.fetchAllLookupTableAccounts();
		// Filter out null/undefined values and return empty array if undefined
		return (
			lookupTables?.filter((table) => table !== null && table !== undefined) ??
			[]
		);
	};

	const depositTxn = await velocityClient.txHandler.buildTransaction({
		instructions: depositIxs,
		txVersion: 0,
		connection: velocityClient.connection,
		preFlightCommitment: 'confirmed',
		fetchAllMarketLookupTableAccounts: fetchFilteredLookupTables,
		txParams,
	});

	return depositTxn;
};

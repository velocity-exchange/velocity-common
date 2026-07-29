import {
	BN,
	VelocityClient,
	getUserAccountPublicKeySync,
	PublicKey,
	ReferrerInfo,
	ReferrerNameAccount,
	SpotMarketConfig,
	TxParams,
	UserStatsAccount,
	ZERO,
} from '@velocity-exchange/sdk';
import { getTokenAddressForDepositAndWithdraw } from '../../../../utils/token';
import { DEFAULT_ACCOUNT_NAMES_BY_POOL_ID } from '../../constants/accountNames';
import { MAIN_POOL_ID } from '../../../../constants/pools';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { checkIfUserAccountExists } from '../../../../utils/positions/user';

// Concurrent order slots allocated for a referred user's RevenueShareEscrow at
// signup. Matches the default used by createRevenueShareEscrowIx.
const DEFAULT_REFERRAL_ESCROW_NUM_ORDERS = 16;

/**
 * Referral options for account creation. When provided, the new user is created
 * with the referrer and a RevenueShareEscrow that referral rewards accrue into.
 */
export interface ReferralParams {
	/** The referrer's registered referral name. */
	name: string;
	/**
	 * Concurrent order slots to allocate in the referred user's RevenueShareEscrow
	 * at signup. Defaults to 16.
	 */
	escrowNumOrders?: number;
}

interface CreateUserAndDepositCollateralBaseIxsParams {
	velocityClient: VelocityClient;
	amount: BN;
	spotMarketConfig: SpotMarketConfig;
	authority: PublicKey;
	userStatsAccount: UserStatsAccount | undefined;
	referral?: ReferralParams;
	accountName?: string;
	poolId?: number;
	fromSubAccountId?: number;
	customMaxMarginRatio?: number;
	delegate?: PublicKey;
	/**
	 * Optional external wallet to deposit from. If provided, the deposit will be made
	 * from this wallet instead of the authority wallet.
	 */
	externalWallet?: PublicKey;
}

/**
 * Creates transaction instructions for initializing a new user account and depositing collateral.
 *
 * This function generates the necessary transaction instructions to:
 * 1. Initialize a new user account in the Velocity protocol
 * 2. Deposit collateral into the newly created account
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param amount - The amount of collateral to deposit (in base units)
 * @param spotMarketConfig - The spot market config of the deposit collateral
 * @param authority - The public key of the account authority (wallet owner)
 * @param userStatsAccount - Existing user stats account, used to determine next sub-account ID
 * @param referral - Optional referral options (referrer name and escrow size)
 * @param accountName - Optional custom name for the account (defaults to pool-specific name)
 * @param poolId - The pool ID to associate the account with (defaults to MAIN_POOL_ID)
 * @param fromSubAccountId - Optional sub-account ID to transfer funds from
 * @param customMaxMarginRatio - Optional custom maximum margin ratio for the account
 * @param delegate - Optional delegate public key for the account. Immediately assigns this as the delegate of the account.
 * @param externalWallet - Optional external wallet to deposit from (instead of authority wallet)
 *
 * @returns Promise resolving to an object containing:
 *   - subAccountId: The ID of the newly created sub-account
 *   - userAccountPublicKey: The public key of the created user account
 *   - ixs: Array of transaction instructions to execute
 */
export const createUserAndDepositCollateralBaseIxs = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	authority,
	userStatsAccount,
	referral,
	accountName,
	poolId = MAIN_POOL_ID,
	fromSubAccountId,
	customMaxMarginRatio,
	delegate,
	externalWallet,
}: CreateUserAndDepositCollateralBaseIxsParams): Promise<{
	subAccountId: number;
	userAccountPublicKey: PublicKey;
	ixs: TransactionInstruction[];
}> => {
	const nextSubaccountId = userStatsAccount?.numberOfSubAccountsCreated ?? 0; // userId is zero indexed

	// Get the spot market account to determine the correct token program for Token-2022 tokens
	const spotMarketAccount = velocityClient.getSpotMarketAccount(
		spotMarketConfig.marketIndex
	);

	if (!spotMarketAccount) {
		throw new Error(
			`Spot market account not found for market index ${spotMarketConfig.marketIndex}`
		);
	}

	// Use external wallet for token address if provided, otherwise use authority
	const depositSourceWallet = externalWallet ?? authority;
	const associatedDepositTokenAddressPromise =
		getTokenAddressForDepositAndWithdraw(
			spotMarketAccount,
			depositSourceWallet
		);
	const referrerNameAccountPromise: Promise<ReferrerNameAccount | undefined> =
		referral
			? velocityClient.fetchReferrerNameAccount(referral.name)
			: Promise.resolve(undefined);
	const subaccountExistsPromise = checkIfUserAccountExists(velocityClient, {
		type: 'subAccountId',
		subAccountId: nextSubaccountId,
		authority,
	});

	const [associatedDepositTokenAddress, referrerNameAccount, subaccountExists] =
		await Promise.all([
			associatedDepositTokenAddressPromise,
			referrerNameAccountPromise,
			subaccountExistsPromise,
		]);

	if (subaccountExists) {
		throw new Error('Subaccount already exists');
	}

	const accountNameToUse =
		accountName ??
		(poolId !== MAIN_POOL_ID || nextSubaccountId === 0
			? DEFAULT_ACCOUNT_NAMES_BY_POOL_ID[poolId]
			: `Account ${nextSubaccountId}`);

	const referrerInfo: ReferrerInfo | undefined = referrerNameAccount
		? {
				referrer: referrerNameAccount.user,
				referrerStats: referrerNameAccount.userStats,
			}
		: undefined;

	const { ixs: createAndDepositIxs, userAccountPublicKey } =
		await velocityClient.createInitializeUserAccountAndDepositCollateralIxs(
			amount,
			associatedDepositTokenAddress,
			spotMarketConfig.marketIndex,
			nextSubaccountId,
			accountNameToUse,
			fromSubAccountId,
			referrerInfo,
			ZERO,
			customMaxMarginRatio,
			poolId,
			externalWallet ? { externalWallet } : undefined
		);
	const ixs: TransactionInstruction[] = [...createAndDepositIxs];

	// A referral is recorded by initializeUser setting userStats.referrer above.
	// Referral rewards now accrue through the user's RevenueShareEscrow, and
	// initializeRevenueShareEscrow reads userStats.referrer into the escrow (setting
	// the BuilderReferral status), so a referred user needs the escrow created at
	// signup. Only relevant on the first subaccount, where userStats — and its
	// referrer — is created.
	if (referrerInfo && nextSubaccountId === 0) {
		const initEscrowIx = await velocityClient.getInitializeRevenueShareEscrowIx(
			authority,
			referral?.escrowNumOrders ?? DEFAULT_REFERRAL_ESCROW_NUM_ORDERS,
			{ payer: externalWallet ?? authority }
		);
		ixs.push(initEscrowIx);
	}

	const nextSubAccountPublicKey = getUserAccountPublicKeySync(
		velocityClient.program.programId,
		authority,
		nextSubaccountId
	);
	const delegateIx = delegate
		? await velocityClient.getUpdateUserDelegateIx(delegate, {
				subAccountId: nextSubaccountId,
				userAccountPublicKey: nextSubAccountPublicKey,
				authority,
			})
		: undefined;

	if (delegateIx) {
		ixs.push(delegateIx);
	}

	return {
		subAccountId: nextSubaccountId,
		userAccountPublicKey,
		ixs,
	};
};

interface CreateUserAndDepositCollateralBaseTxnParams extends CreateUserAndDepositCollateralBaseIxsParams {
	txParams?: TxParams;
}

/**
 * Creates a complete transaction for initializing a new user account and depositing collateral.
 *
 * This function is a higher-level wrapper around `createUserAndDepositCollateralBaseIxs` that:
 * 1. Generates the necessary transaction instructions
 * 2. Builds a complete transaction ready for signing and submission
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param amount - The amount of collateral to deposit (in base units)
 * @param spotMarketConfig - The spot market config of the deposit collateral
 * @param authority - The public key of the account authority (wallet owner)
 * @param userStatsAccount - Existing user stats account, used to determine next sub-account ID
 * @param referral - Optional referral options (referrer name and escrow size)
 * @param accountName - Optional custom name for the account (defaults to pool-specific name)
 * @param poolId - The pool ID to associate the account with (defaults to MAIN_POOL_ID)
 * @param fromSubAccountId - Optional sub-account ID to transfer funds from
 * @param customMaxMarginRatio - Optional custom maximum margin ratio for the account
 * @param txParams - Transaction parameters for building the transaction (compute units, priority fees, etc.)
 * @param externalWallet - Optional external wallet to deposit from (instead of authority wallet)
 *
 * @returns Promise resolving to an object containing:
 *   - transaction: The built transaction ready for signing (Transaction or VersionedTransaction)
 *   - userAccountPublicKey: The public key of the created user account
 *   - subAccountId: The ID of the newly created sub-account
 */
export const createUserAndDepositCollateralBaseTxn = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	authority,
	userStatsAccount,
	referral,
	accountName,
	poolId = MAIN_POOL_ID,
	fromSubAccountId,
	customMaxMarginRatio,
	txParams,
	externalWallet,
}: CreateUserAndDepositCollateralBaseTxnParams): Promise<{
	transaction: Transaction | VersionedTransaction;
	userAccountPublicKey: PublicKey;
	subAccountId: number;
}> => {
	const { ixs, userAccountPublicKey, subAccountId } =
		await createUserAndDepositCollateralBaseIxs({
			velocityClient,
			amount,
			spotMarketConfig,
			authority,
			userStatsAccount,
			referral,
			accountName,
			poolId,
			fromSubAccountId,
			customMaxMarginRatio,
			externalWallet,
		});

	const tx = await velocityClient.buildTransaction(ixs, txParams);

	return { transaction: tx, userAccountPublicKey, subAccountId };
};

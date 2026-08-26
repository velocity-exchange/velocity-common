import {
	VelocityClient,
	User,
	SettlePnlMode,
	TxParams,
} from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
	PublicKey,
} from '@solana/web3.js';

interface SettlePnlParams {
	velocityClient: VelocityClient;
	user: User;
	marketIndexes: number[];
	mode?: typeof SettlePnlMode.TRY_SETTLE | typeof SettlePnlMode.MUST_SETTLE;
	mainSignerOverride?: PublicKey;
}

/**
 * Creates transaction instruction for settling PnL for multiple markets.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will settle PnL
 * @param marketIndexes - Array of perp market indexes to settle PnL for
 * @param mode - Settlement mode (defaults to TRY_SETTLE)
 *
 * @returns Promise resolving to a transaction instructions for settling PnL
 */
export const createSettlePnlIx = async ({
	velocityClient,
	user,
	marketIndexes,
	mode = SettlePnlMode.TRY_SETTLE,
	mainSignerOverride,
}: SettlePnlParams): Promise<TransactionInstruction> => {
	const userAccountPublicKey = user.getUserAccountPublicKey();
	const userAccount = user.getUserAccountOrThrow();

	const settlePnlIx = await velocityClient.settleMultiplePNLsIx(
		userAccountPublicKey,
		userAccount,
		marketIndexes,
		mode,
		{
			authority: mainSignerOverride,
		}
	);

	return settlePnlIx;
};

interface CreateSettlePnlTxnParams extends SettlePnlParams {
	txParams?: TxParams;
}

/**
 * Creates a complete transaction for settling PnL for multiple markets.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will settle PnL
 * @param marketIndexes - Array of perp market indexes to settle PnL for
 * @param mode - Settlement mode (defaults to TRY_SETTLE)
 * @param txParams - Transaction parameters
 *
 * @returns Promise resolving to a built transaction ready for signing (Transaction or VersionedTransaction)
 */
export const createSettlePnlTxn = async ({
	velocityClient,
	user,
	marketIndexes,
	mode = SettlePnlMode.TRY_SETTLE,
	txParams,
	mainSignerOverride,
}: CreateSettlePnlTxnParams): Promise<Transaction | VersionedTransaction> => {
	const settlePnlIxs = await createSettlePnlIx({
		velocityClient,
		user,
		marketIndexes,
		mode,
		mainSignerOverride,
	});

	const settlePnlTxn = await velocityClient.buildTransaction(
		settlePnlIxs,
		txParams
	);

	return settlePnlTxn;
};

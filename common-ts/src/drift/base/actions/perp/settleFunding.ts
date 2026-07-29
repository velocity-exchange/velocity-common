import { VelocityClient, TxParams, User } from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';

interface CreateSettleFundingIxParams {
	velocityClient: VelocityClient;
	user: User;
}

/**
 * Creates transaction instructions for settling funding payments.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will settle funding payments
 *
 * @returns Promise resolving to an array of transaction instructions for settling funding
 */
export const createSettleFundingIx = async ({
	velocityClient,
	user,
}: CreateSettleFundingIxParams): Promise<TransactionInstruction[]> => {
	const userAccountPublicKey = user.getUserAccountPublicKey();

	const settleFundingIx =
		await velocityClient.getSettleFundingPaymentIx(userAccountPublicKey);

	return [settleFundingIx];
};

interface CreateSettleFundingTxnParams extends CreateSettleFundingIxParams {
	txParams?: TxParams;
}

/**
 * Creates a complete transaction for settling funding payments.
 *
 * @param velocityClient - The Velocity client instance for interacting with the protocol
 * @param user - The user account that will settle funding payments
 *
 * @returns Promise resolving to a built transaction ready for signing (Transaction or VersionedTransaction)
 */
export const createSettleFundingTxn = async ({
	velocityClient,
	user,
	txParams,
}: CreateSettleFundingTxnParams): Promise<
	Transaction | VersionedTransaction
> => {
	const settleFundingIxs = await createSettleFundingIx({
		velocityClient,
		user,
	});

	const settleFundingTxn = await velocityClient.txHandler.buildTransaction({
		instructions: settleFundingIxs,
		txVersion: 0,
		connection: velocityClient.connection,
		preFlightCommitment: 'confirmed',
		fetchAllMarketLookupTableAccounts:
			velocityClient.fetchAllLookupTableAccounts.bind(velocityClient),
		txParams,
	});

	return settleFundingTxn;
};

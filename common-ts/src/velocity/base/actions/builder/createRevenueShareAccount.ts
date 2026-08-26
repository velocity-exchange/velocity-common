import { VelocityClient } from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
	PublicKey,
} from '@solana/web3.js';
import { WithTxnParams } from '../../types';

interface CreateRevenueShareAccountIxParams {
	velocityClient: VelocityClient;
	/**
	 * The authority of the revenue share account to be created.
	 * This is typically the builder's public key.
	 */
	authority: PublicKey;
	/**
	 * The public key of the account that will pay for the revenue share account rent.
	 * If not provided, the authority provided will be the payer.
	 */
	payer?: PublicKey;
}

/**
 * Creates a transaction instruction to initialize a RevenueShare account for a builder.
 *
 * The RevenueShare account tracks cumulative builder fees earned from routing trades.
 * This must be initialized before a builder can receive builder fees.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the builder who will own this revenue share account
 * @param payer - The public key of the account that will pay for the revenue share account rent. If not provided, the authority provided will be the payer.
 *
 * @example
 * ```typescript
 * const instruction = await createRevenueShareAccountIx({
 *   velocityClient,
 *   authority: builderPublicKey
 * });
 * ```
 */
export const createRevenueShareAccountIx = async (
	params: CreateRevenueShareAccountIxParams
): Promise<TransactionInstruction> => {
	const { velocityClient, authority } = params;

	return velocityClient.getInitializeRevenueShareIx(authority, {
		payer: params.payer ?? authority,
	});
};

/**
 * Creates a transaction to initialize a RevenueShare account for a builder.
 *
 * The RevenueShare account tracks cumulative builder fees earned from routing trades.
 * This must be initialized before a builder can receive builder code fees.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the builder who will own this revenue share account
 * @param txParams - Optional transaction parameters for customizing the transaction
 *
 * @returns Promise resolving to a Transaction or VersionedTransaction ready for signing
 *
 * @example
 * ```typescript
 * // Initialize a revenue share account for a builder
 * const transaction = await createRevenueShareAccountTxn({
 *   velocityClient,
 *   authority: builderPublicKey,
 *   txParams: { computeUnits: 200000 }
 * });
 *
 * // Sign and send the transaction
 * const signature = await wallet.sendTransaction(transaction, connection);
 * ```
 */
export const createRevenueShareAccountTxn = async (
	params: WithTxnParams<CreateRevenueShareAccountIxParams>
): Promise<Transaction | VersionedTransaction> => {
	return params.velocityClient.buildTransaction(
		await createRevenueShareAccountIx(params),
		params.txParams
	);
};

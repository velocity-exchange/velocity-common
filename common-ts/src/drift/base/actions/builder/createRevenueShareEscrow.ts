import { VelocityClient } from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
	PublicKey,
} from '@solana/web3.js';
import { WithTxnParams } from '../../types';
import { configureBuilderIx } from './configureBuilder';

interface CreateRevenueShareEscrowIxParams {
	velocityClient: VelocityClient;
	/**
	 * The authority (owner) of the revenue share escrow account to be created.
	 * This is typically the user/taker's public key.
	 */
	authority: PublicKey;
	/**
	 * Number of order slots to allocate in the escrow account.
	 * This determines how many concurrent builder orders can be tracked.
	 * Recommended: 8-32 for typical users, up to 128 maximum.
	 */
	numOrders?: number;
	/**
	 * The public key of the account that will pay for the revenue share escrow account rent.
	 * If not provided, the authority provided will be the payer.
	 */
	payer?: PublicKey;
}

/**
 * Creates a transaction instruction to initialize a `RevenueShareEscrow` account for a user.
 *
 * The RevenueShareEscrow account stores:
 * - List of approved builders with their max fee caps
 * - Pending builder fee orders waiting to be settled
 *
 * Users must initialize this account before they can place orders with builder codes.
 *
 * **Important**: `numOrders` determines CONCURRENT order capacity, not lifetime total orders.
 * When the escrow is full, new orders will succeed but builder fees won't be tracked.
 * See README_ORDER_LIMITS.md for capacity planning guidance.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the user who will own this escrow account
 * @param numOrders - Number of concurrent order slots (default: 16, range: 1-128)
 *   - 8: Casual traders (2-3 markets, occasional trading)
 *   - 16: Active traders (3-5 markets, regular trading) ← Recommended default
 *   - 32-64: Power users (many markets, frequent trading)
 *   - 128: Maximum capacity (institutional usage)
 * @param payer - The public key of the account that will pay for the revenue share escrow account rent
 *
 * @returns Promise resolving to a TransactionInstruction that initializes the revenue share escrow
 *
 * @example
 * ```typescript
 * // Default configuration (16 order slots)
 * const instruction = await createRevenueShareEscrowIx({
 *   velocityClient,
 *   authority: userPublicKey
 * });
 *
 * // Custom configuration for power user
 * const instruction = await createRevenueShareEscrowIx({
 *   velocityClient,
 *   authority: userPublicKey,
 *   numOrders: 32  // More concurrent capacity
 * });
 * ```
 */
export const createRevenueShareEscrowIx = async ({
	velocityClient,
	authority,
	numOrders = 16,
	payer,
}: CreateRevenueShareEscrowIxParams): Promise<TransactionInstruction> => {
	return velocityClient.getInitializeRevenueShareEscrowIx(
		authority,
		numOrders,
		{
			payer: payer ?? authority,
		}
	);
};

interface CreateRevenueShareEscrowTxnParams extends WithTxnParams<CreateRevenueShareEscrowIxParams> {
	/**
	 * The builder to add to the escrow account.
	 */
	builder?: {
		/**
		 * The public key of the builder to add to the escrow account.
		 */
		builderAuthority: PublicKey;
		/**
		 * The maximum fee the builder can charge, in tenths of basis points.
		 */
		maxFeeTenthBps: number;
	};
}

/**
 * Creates a transaction to initialize a RevenueShareEscrow account for a user.
 *
 * The RevenueShareEscrow account stores:
 * - List of approved builders with their max fee caps
 * - Pending builder fee orders waiting to be settled
 *
 * Users must initialize this account before they can place orders with builder codes.
 *
 * **Important**: `numOrders` determines CONCURRENT order capacity, not lifetime total orders.
 * When the escrow is full, new orders will succeed but builder fees won't be tracked.
 * See README_ORDER_LIMITS.md for capacity planning guidance.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the user who will own this escrow account
 * @param numOrders - Number of concurrent order slots (default: 16, range: 1-128)
 *   - 8: Casual traders (2-3 markets, occasional trading)
 *   - 16: Active traders (3-5 markets, regular trading) ← Recommended default
 *   - 32-64: Power users (many markets, frequent trading)
 *   - 128: Maximum capacity (institutional usage)
 * @param payer - The public key of the account that will pay for the revenue share escrow account rent
 * @param txParams - Optional transaction parameters for customizing the transaction
 *
 * @returns Promise resolving to a Transaction or VersionedTransaction ready for signing
 *
 * @example
 * ```typescript
 * // Default configuration (16 order slots)
 * const transaction = await createRevenueShareEscrowTxn({
 *   velocityClient,
 *   authority: userPublicKey,
 *   txParams: { computeUnits: 300000 }
 * });
 *
 * // Custom configuration for power user
 * const transaction = await createRevenueShareEscrowTxn({
 *   velocityClient,
 *   authority: userPublicKey,
 *   numOrders: 32,  // More concurrent capacity
 *   txParams: { computeUnits: 300000 }
 * });
 *
 * // Sign and send the transaction
 * const signature = await wallet.sendTransaction(transaction, connection);
 * ```
 */
export const createRevenueShareEscrowTxn = async (
	params: CreateRevenueShareEscrowTxnParams
): Promise<Transaction | VersionedTransaction> => {
	const createIx = await createRevenueShareEscrowIx(params);
	const ixs = [createIx];

	if (params.builder) {
		const addBuilderIx = await configureBuilderIx({
			velocityClient: params.velocityClient,
			authority: params.authority,
			builderAuthority: params.builder.builderAuthority,
			maxFeeTenthBps: params.builder.maxFeeTenthBps,
			payer: params.payer ?? params.authority,
		});

		ixs.push(addBuilderIx);
	}

	return params.velocityClient.buildTransaction(ixs, params.txParams);
};

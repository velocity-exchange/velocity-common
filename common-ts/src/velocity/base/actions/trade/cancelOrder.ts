import {
	CancelOrderV1Params,
	CancelSidesV0,
	User,
	VelocityClient,
} from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
	PublicKey,
} from '@solana/web3.js';
import { WithTxnParams } from '../../types';

interface CreateCancelOrdersIxParams {
	velocityClient: VelocityClient;
	user: User;
	orderIds: number[];
	mainSignerOverride?: PublicKey;
}

/**
 * Creates a transaction instruction to cancel multiple orders by their order IDs.
 *
 * @param velocityClient - The Velocity client instance.
 * @param orderIds - Array of order IDs to cancel. Each ID corresponds to a specific order
 * @param user - The user client that owns the orders to be cancelled
 *
 * @returns Promise resolving to a TransactionInstruction that cancels the specified orders
 *
 * @example
 * ```typescript
 * const instruction = await cancelOrderIxs(
 *   velocityClient,
 *   [123, 456, 789], // Cancel orders with IDs 123, 456, and 789
 *   user
 * );
 *
 * ```
 */
export const createCancelOrdersIx = async (
	params: CreateCancelOrdersIxParams
): Promise<TransactionInstruction> => {
	const { velocityClient, user, orderIds, mainSignerOverride } = params;

	return velocityClient.getCancelOrdersByIdsIx(orderIds, undefined, user, {
		authority: mainSignerOverride,
	});
};

/**
 * Creates a transaction to cancel multiple orders by their IDs.
 *
 * @param velocityClient - The Velocity client instance.
 * @param orderIds - Array of order IDs to cancel. Each ID corresponds to a specific order
 * @param user - The user client that owns the orders to be cancelled
 * @param txParams - Optional transaction parameters for customizing the transaction
 *
 * @returns Promise resolving to a Transaction or VersionedTransaction ready for signing
 *
 * @example
 * ```typescript
 * // Cancel multiple orders
 * const transaction = await cancelOrderTxn(
 *   velocityClient,
 *   [123, 456], // Cancel orders with IDs 123 and 456
 *   user,
 *   { computeUnits: 200000 } // Optional transaction parameters
 * );
 *
 * // Sign and send the transaction
 * const signature = await wallet.sendTransaction(transaction, connection);
 * ```
 */
export const createCancelOrdersTxn = async (
	params: WithTxnParams<CreateCancelOrdersIxParams>
): Promise<Transaction | VersionedTransaction> => {
	return params.velocityClient.buildTransaction(
		await createCancelOrdersIx(params),
		params.txParams
	);
};

interface CreateCancelClobOrderIxParams {
	velocityClient: VelocityClient;
	user: User;
	order: CancelOrderV1Params;
	/** The feed's `takerOrigin` flag. A taker remainder releases its signed-message entry. */
	takerOrigin: boolean;
	mainSignerOverride?: PublicKey;
}

/**
 * Cancels one resting book order. A book order has no `User.orders` slot, so it cancels by the
 * `orderRef` the feed carries. The book refuses a stale ref, so a fill that moved the order fails
 * the cancel instead of hitting another order.
 */
export const createCancelClobOrderIx = async (
	params: CreateCancelClobOrderIxParams
): Promise<TransactionInstruction> => {
	const { velocityClient, user, order, takerOrigin, mainSignerOverride } =
		params;

	return velocityClient.getCancelOrderV1Ix(
		order,
		user.getUserAccountOrThrow().subAccountId,
		takerOrigin,
		{ authority: mainSignerOverride }
	);
};

interface CreateCancelAllClobOrdersIxParams {
	velocityClient: VelocityClient;
	user: User;
	marketIndex: number;
	mainSignerOverride?: PublicKey;
}

/**
 * Sweeps both sides of one market's book. One call removes a capped number of orders and leaves
 * taker remainders, so the caller repeats it while the feed still shows orders.
 */
export const createCancelAllClobOrdersIx = async (
	params: CreateCancelAllClobOrdersIxParams
): Promise<TransactionInstruction> => {
	const { velocityClient, user, marketIndex, mainSignerOverride } = params;

	return velocityClient.getCancelOrdersV1Ix(
		{ marketIndex, sides: CancelSidesV0.BOTH },
		user.getUserAccountOrThrow().subAccountId,
		{ authority: mainSignerOverride }
	);
};

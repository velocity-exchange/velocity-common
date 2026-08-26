import {
	VelocityClient,
	TxParams,
	User,
	UserStatsAccount,
} from '@velocity-exchange/sdk';

/**
 * Parameters required for deleting a user instruction
 */
interface DeleteUserIxsParams {
	/** The Velocity protocol client instance */
	velocityClient: VelocityClient;
	user: User;
	userStatsAccount: UserStatsAccount;
}

/**
 * Creates user deletion instructions. If the account is a fresh non-idle account,
 * includes an idle instruction before the deletion instruction.
 */
export const deleteUserIxs = async ({
	velocityClient,
	user,
	userStatsAccount,
}: DeleteUserIxsParams) => {
	const { canDelete, reason } = user.canBeDeleted(userStatsAccount);

	const userPublicKey = user.userAccountPublicKey;

	if (canDelete) {
		return [await velocityClient.getUserDeletionIx(userPublicKey)];
	}

	if (reason === 'is-not-idle-fresh-account') {
		const [idleIx, deleteIx] = await Promise.all([
			velocityClient.getUpdateUserIdleIx(
				userPublicKey,
				user.getUserAccountOrThrow()
			),
			velocityClient.getUserDeletionIx(userPublicKey),
		]);
		return [idleIx, deleteIx];
	}

	throw new Error(reason);
};

/**
 * Parameters required for creating a user deletion transaction
 * Extends DeleteUserIxParams with optional transaction parameters
 */
interface DeleteUserTxnParams extends DeleteUserIxsParams {
	/** Optional transaction parameters for customizing the transaction */
	txParams?: TxParams;
}

/**
 * Creates a user deletion transaction.
 *
 * @example
 * ```typescript
 * const deleteTxn = await deleteUserTxn({
 *   velocityClient: velocityClient,
 *   user: userClient,
 *   txParams: { useSimulatedComputeUnits: true }
 * });
 *
 * // Sign and send the transaction
 * const signature = await velocityClient.sendTransaction(deleteTxn);
 * ```
 */
export const deleteUserTxn = async ({
	velocityClient,
	user,
	userStatsAccount,
	txParams,
}: DeleteUserTxnParams) => {
	const deleteIx = await deleteUserIxs({
		velocityClient,
		user,
		userStatsAccount,
	});
	return velocityClient.buildTransaction(deleteIx, txParams);
};

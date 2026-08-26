import {
	VelocityClient,
	getSignedMsgUserAccountPublicKey,
	PublicKey,
	TxParams,
} from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';

interface CreateSwiftAccountIxParams {
	velocityClient: VelocityClient;
	authority: PublicKey;
	numOrders?: number;
	/**
	 * Optional external wallet to use as payer. If provided, this wallet will pay
	 * for the account creation instead of the default wallet.
	 */
	rentPayerOverride?: PublicKey;
}

/**
 * Creates a transaction instruction for initializing a Swift (signed message user orders) account.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the account authority
 * @param numOrders - The number of order slots to allocate (default: 8)
 * @param rentPayerOverride - Optional wallet to pay for account creation instead of the default wallet
 *
 * @returns The Swift account public key and the initialization instruction
 */
export const createSwiftAccountIx = async ({
	velocityClient,
	authority,
	numOrders = 8,
	rentPayerOverride,
}: CreateSwiftAccountIxParams): Promise<{
	swiftAccountPublicKey: PublicKey;
	ix: TransactionInstruction;
}> => {
	const [swiftAccountPublicKey, ix] =
		await velocityClient.getInitializeSignedMsgUserOrdersAccountIx(
			authority,
			numOrders,
			{ externalWallet: rentPayerOverride }
		);

	return { swiftAccountPublicKey, ix };
};

interface CreateSwiftAccountTxnParams extends CreateSwiftAccountIxParams {
	txParams?: TxParams;
}

/**
 * Creates a complete transaction for initializing a Swift (signed message user orders) account.
 *
 * Wraps {@link createSwiftAccountIx} and builds a transaction ready for signing and submission.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the account authority
 * @param numOrders - The number of order slots to allocate (default: 8)
 * @param rentPayerOverride - Optional wallet to pay for account creation instead of the default wallet
 * @param txParams - Optional transaction parameters (compute units, priority fees, etc.)
 *
 * @returns The built transaction and the Swift account public key
 */
export const createSwiftAccountTxn = async ({
	velocityClient,
	authority,
	numOrders,
	rentPayerOverride,
	txParams,
}: CreateSwiftAccountTxnParams): Promise<{
	transaction: Transaction | VersionedTransaction;
	swiftAccountPublicKey: PublicKey;
}> => {
	const { swiftAccountPublicKey, ix } = await createSwiftAccountIx({
		velocityClient,
		authority,
		numOrders,
		rentPayerOverride,
	});

	const transaction = await velocityClient.buildTransaction([ix], txParams);

	return { transaction, swiftAccountPublicKey };
};

/**
 * Creates a Swift account instruction only if one doesn't already exist for the given authority.
 *
 * Always returns the Swift account public key. The `ix` will be `null` if the account
 * is already initialized, indicating no transaction is needed.
 *
 * @param velocityClient - The Velocity client instance
 * @param authority - The public key of the account authority
 * @param numOrders - The number of order slots to allocate (default: 8)
 * @param rentPayerOverride - Optional wallet to pay for account creation instead of the default wallet
 *
 * @returns The Swift account public key and the initialization instruction (null if already initialized)
 */
export const createSwiftAccountIxIfNotExists = async ({
	velocityClient,
	authority,
	numOrders = 8,
	rentPayerOverride,
}: CreateSwiftAccountIxParams): Promise<{
	swiftAccountPublicKey: PublicKey;
	ix: TransactionInstruction | null;
}> => {
	const isInitialized =
		await velocityClient.isSignedMsgUserOrdersAccountInitialized(authority);

	if (isInitialized) {
		const swiftAccountPublicKey = getSignedMsgUserAccountPublicKey(
			velocityClient.program.programId,
			authority
		);

		return { swiftAccountPublicKey, ix: null };
	}

	return await createSwiftAccountIx({
		velocityClient,
		authority,
		numOrders,
		rentPayerOverride,
	});
};

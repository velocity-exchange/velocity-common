import {
	BN,
	VelocityClient,
	TxParams,
	User,
	SwapQuote,
	SwapProvider,
} from '@velocity-exchange/sdk';
import {
	AddressLookupTableAccount,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';

/**
 * Parameters for creating swap instruction details
 */
interface CreateSwapIxDetailsParams {
	/** The Velocity client instance for interacting with the Velocity protocol */
	velocityClient: VelocityClient;
	/** Quote response from swap provider containing swap route information */
	quote: SwapQuote;
	/** Swap client instance for performing the swap */
	swapProvider: SwapProvider;
	/** Market index of the token being swapped from */
	swapFromMarketIndex: number;
	/** Market index of the token being swapped to */
	swapToMarketIndex: number;
	/** Amount to swap in base units */
	amount: BN;
	/** User instance containing account information */
	user: User;
}

/**
 * Creates swap instruction details for a swap through Velocity
 *
 * @param velocityClient - The Velocity client instance
 * @param swapClient - The swap client instance for performing the swap (supports UnifiedSwapClient or JupiterClient)
 * @param quote - Quote response from swap provider with routing information
 * @param swapFromMarketIndex - Source token market index
 * @param swapToMarketIndex - Destination token market index
 * @param amount - Amount to swap in base units
 * @param user - User account instance
 * @returns Promise resolving to an object containing transaction instructions and lookup tables
 * @returns ixs - Array of Solana transaction instructions for the swap
 * @returns lookupTables - Address lookup table accounts for transaction compression
 */
export const createSwapIxDetails = async ({
	velocityClient,
	swapProvider,
	quote,
	swapFromMarketIndex,
	swapToMarketIndex,
	amount,
	user,
}: CreateSwapIxDetailsParams): Promise<{
	ixs: TransactionInstruction[];
	lookupTables: AddressLookupTableAccount[];
}> => {
	const userPublicKey = user.userAccountPublicKey;

	const swapIxsDetails = await velocityClient.getProviderSwapIx({
		swapProvider,
		outMarketIndex: swapToMarketIndex,
		inMarketIndex: swapFromMarketIndex,
		amount,
		quote,
		userAccountPublicKey: userPublicKey,
	});

	return swapIxsDetails;
};

/**
 * Parameters for creating a complete swap transaction
 * Extends CreateSwapIxDetailsParams with additional transaction parameters
 */
interface CreateSwapTxnParams extends CreateSwapIxDetailsParams {
	/** Transaction parameters including compute units, priority fees, and other options */
	txParams?: TxParams;
}

/**
 * Creates a complete swap transaction ready for signing and submission
 *
 * @param velocityClient - The Velocity client instance
 * @param swapClient - The swap client instance for performing the swap (supports UnifiedSwapClient or JupiterClient)
 * @param quote - Quote response from swap provider with routing information
 * @param swapFromMarketIndex - Source token market index
 * @param swapToMarketIndex - Destination token market index
 * @param amount - Amount to swap in base units
 * @param user - User account instance
 * @param txParams - Transaction parameters for fees and compute units
 * @returns Promise resolving to either a legacy Transaction or VersionedTransaction ready for signing
 */
export const createSwapTxn = async ({
	velocityClient,
	swapProvider,
	quote,
	swapFromMarketIndex,
	swapToMarketIndex,
	amount,
	user,
	txParams,
}: CreateSwapTxnParams): Promise<Transaction | VersionedTransaction> => {
	const swapIxsDetails = await createSwapIxDetails({
		velocityClient,
		swapProvider,
		quote,
		swapFromMarketIndex,
		swapToMarketIndex,
		amount,
		user,
	});

	const tx = await velocityClient.buildTransaction(
		swapIxsDetails.ixs,
		txParams,
		0,
		swapIxsDetails.lookupTables
	);

	return tx;
};

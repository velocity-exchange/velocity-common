import {
	VelocityClient,
	PerpMarketAccount,
	User,
} from '@velocity-exchange/sdk';
import {
	PublicKey,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import { WithTxnParams } from '../../types';
import { convertLeverageToMarginRatio } from '../../../../utils/trading/leverage';

export interface CreateUpdateMarketMaxLeverageIxsParams {
	velocityClient: VelocityClient;
	user: User;
	perpMarketAccount: PerpMarketAccount;
	leverage: number;
	mainSignerOverride?: PublicKey;
}

/**
 * Creates transaction instructions to update a user's perp market max leverage
 * @param params - Parameters for updating market max leverage
 * @returns Promise that resolves to an array of transaction instructions
 */
export const createUpdateMarketMaxLeverageIxs = async (
	params: CreateUpdateMarketMaxLeverageIxsParams
): Promise<TransactionInstruction[]> => {
	const {
		velocityClient,
		perpMarketAccount,
		leverage,
		mainSignerOverride,
		user,
	} = params;

	const userAccount = user.getUserAccountOrThrow();
	const subAccountIdToUse = userAccount.subAccountId;

	const ixs: TransactionInstruction[] = [];

	// Update max leverage of perp market for user
	const marginRatio = convertLeverageToMarginRatio(leverage)!;
	const perpMarketIndex = perpMarketAccount.marketIndex;
	const updateMaxLeverageIx =
		await velocityClient.getUpdateUserPerpPositionCustomMarginRatioIx(
			perpMarketIndex,
			marginRatio,
			subAccountIdToUse,
			{
				userAccountPublicKey: params.user.getUserAccountPublicKey(),
				authority: userAccount.authority,
				signingAuthority: mainSignerOverride,
			}
		);
	ixs.push(updateMaxLeverageIx);

	return ixs;
};

type CreateUpdateMarketMaxMarginTxnParams =
	WithTxnParams<CreateUpdateMarketMaxLeverageIxsParams>;

/**
 * Creates a complete transaction to update a user's market max leverage
 * @param params - Parameters for updating market max leverage, including optional transaction parameters
 * @returns Promise that resolves to a Transaction or VersionedTransaction
 */
export const createUpdateMarketMaxLeverageTxn = async ({
	txParams,
	...params
}: CreateUpdateMarketMaxMarginTxnParams): Promise<
	Transaction | VersionedTransaction
> => {
	return params.velocityClient.buildTransaction(
		await createUpdateMarketMaxLeverageIxs(params),
		txParams
	);
};

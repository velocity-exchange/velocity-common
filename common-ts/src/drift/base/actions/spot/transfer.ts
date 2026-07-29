import {
	BigNum,
	VelocityClient,
	SpotMarketConfig,
	TxParams,
} from '@velocity-exchange/sdk';
import {
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';

interface CreateTransferCollateralIxParams {
	velocityClient: VelocityClient;
	amount: BigNum;
	spotMarketConfig: Pick<SpotMarketConfig, 'marketIndex'>;
	fromSubAccountId: number;
	toSubAccountId: number;
}

export const createTransferCollateralIx = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	fromSubAccountId,
	toSubAccountId,
}: CreateTransferCollateralIxParams): Promise<TransactionInstruction> => {
	return velocityClient.getTransferDepositIx(
		amount.val,
		spotMarketConfig.marketIndex,
		fromSubAccountId,
		toSubAccountId
	);
};

interface CreateTransferCollateralTxnParams extends CreateTransferCollateralIxParams {
	txParams?: TxParams;
}

export const createTransferCollateralTxn = async ({
	velocityClient,
	amount,
	spotMarketConfig,
	fromSubAccountId,
	toSubAccountId,
	txParams,
}: CreateTransferCollateralTxnParams): Promise<
	Transaction | VersionedTransaction
> => {
	const ix = await createTransferCollateralIx({
		velocityClient,
		amount,
		spotMarketConfig,
		fromSubAccountId,
		toSubAccountId,
	});

	return velocityClient.buildTransaction(ix, txParams);
};

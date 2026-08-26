import {
	VelocityClient,
	encodeName,
	PublicKey,
	TxParams,
} from '@velocity-exchange/sdk';

interface UpdateUserNameIxParams {
	velocityClient: VelocityClient;
	newName: string;
	userAccountPublicKey: PublicKey;
	subAccountId: number;
}

export const updateUserNameIx = async ({
	velocityClient,
	newName,
	userAccountPublicKey,
	subAccountId,
}: UpdateUserNameIxParams) => {
	const nameBuffer = encodeName(newName);
	// TODO: cast to any to avoid "Type instantiation is excessively deep and possibly infinite." error from Anchor's generic types against the Velocity IDL. Fix once SDK is stable.
	const program = velocityClient.program as any;
	const ix = await program.instruction.updateUserName(
		subAccountId,
		nameBuffer,
		{
			accounts: {
				user: userAccountPublicKey,
				authority: velocityClient.wallet.publicKey,
			},
		}
	);
	return ix;
};

interface UpdateUserNameTxnParams extends UpdateUserNameIxParams {
	txParams?: TxParams;
}

export const updateUserNameTxn = async ({
	velocityClient,
	newName,
	userAccountPublicKey,
	subAccountId,
	txParams,
}: UpdateUserNameTxnParams) => {
	const ix = await updateUserNameIx({
		velocityClient,
		newName,
		userAccountPublicKey,
		subAccountId,
	});
	return velocityClient.buildTransaction(ix, txParams);
};

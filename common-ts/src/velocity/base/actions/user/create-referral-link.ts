import {
	VelocityClient,
	encodeName,
	getReferrerNamePublicKeySync,
	getUserStatsAccountPublicKey,
	PublicKey,
	TxParams,
} from '@velocity-exchange/sdk';
import { SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js';

interface CreateReferralLinkIxParams {
	velocityClient: VelocityClient;
	referrerName: string;
	userAccountPublicKey: PublicKey;
	authority: PublicKey;
}

export const createReferralLinkIx = async ({
	velocityClient,
	referrerName,
	userAccountPublicKey,
	authority,
}: CreateReferralLinkIxParams) => {
	const userStatsAccountPublicKey = getUserStatsAccountPublicKey(
		velocityClient.program.programId,
		authority
	);

	const nameBuffer = encodeName(referrerName);
	const referrerNameAccountPublicKey = getReferrerNamePublicKeySync(
		velocityClient.program.programId,
		nameBuffer
	);

	// TODO: cast to any to avoid "Type instantiation is excessively deep and possibly infinite." error from Anchor's generic types against the Velocity IDL. Fix once SDK is stable.
	const program = velocityClient.program as any;
	const ix = await program.instruction.initializeReferrerName(nameBuffer, {
		accounts: {
			referrerName: referrerNameAccountPublicKey,
			user: userAccountPublicKey,
			authority,
			userStats: userStatsAccountPublicKey,
			payer: velocityClient.wallet.publicKey,
			rent: SYSVAR_RENT_PUBKEY,
			systemProgram: SystemProgram.programId,
		},
	});

	return ix;
};

interface CreateReferralLinkTxnParams extends CreateReferralLinkIxParams {
	txParams?: TxParams;
}

export const createReferralLinkTxn = async ({
	velocityClient,
	referrerName,
	userAccountPublicKey,
	authority,
	txParams,
}: CreateReferralLinkTxnParams) => {
	const ix = await createReferralLinkIx({
		velocityClient,
		referrerName,
		userAccountPublicKey,
		authority,
	});

	return velocityClient.buildTransaction(ix, txParams);
};

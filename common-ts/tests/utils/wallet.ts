import {
	BN,
	DevnetSpotMarkets,
	VELOCITY_PROGRAM_ID,
	getUserAccountPublicKeySync,
	QUOTE_PRECISION,
	TokenFaucet,
	WalletV2,
} from '@velocity-exchange/sdk';
import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
} from '@solana/web3.js';
import { EnvironmentConstants } from '../../src/EnvironmentConstants';
import dotenv from 'dotenv';
dotenv.config();

let DEVNET_TEST_WALLET = new WalletV2(Keypair.generate());

let isTestWalletSetupCompleted = false;
let settingUpTestWalletPromise: Promise<void> | null = null;

export const getDevWallet = () => {
	const devWallet = new WalletV2(
		Keypair.fromSecretKey(
			Uint8Array.from(
				JSON.parse(process.env.DRIFT_TEST_WALLET_PRIVATE_KEY as string) // fallback wallet
			)
		)
	);

	return {
		devWallet,
		devUser0: getUserAccountPublicKeySync(
			new PublicKey(VELOCITY_PROGRAM_ID),
			devWallet.publicKey,
			0
		),
		devUser1: getUserAccountPublicKeySync(
			new PublicKey(VELOCITY_PROGRAM_ID),
			devWallet.publicKey,
			1
		),
	};
};

/**
 * Generates a new test wallet for the devnet environment, and attempts to request an airdrop of 0.1 SOL + 1000 USDT.
 * If the airdrop fails, it will use the dev wallet as a fallback wallet.
 */
export const getTestWallet = async () => {
	if (isTestWalletSetupCompleted) {
		return DEVNET_TEST_WALLET;
	}

	if (!settingUpTestWalletPromise) {
		settingUpTestWalletPromise = (async () => {
			try {
				const DEVNET_RPC = EnvironmentConstants.rpcs.dev[1].value; // use helius RPC for available SOL airdrop
				const connection = new Connection(DEVNET_RPC, 'confirmed');
				const airdropSignature = await connection.requestAirdrop(
					DEVNET_TEST_WALLET.publicKey,
					LAMPORTS_PER_SOL / 10
				); // 0.1 SOL
				const latestBlockhash = await connection.getLatestBlockhash();
				await connection.confirmTransaction({
					signature: airdropSignature,
					blockhash: latestBlockhash.blockhash,
					lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
				});

				const faucet = new TokenFaucet(
					connection,
					DEVNET_TEST_WALLET,
					new PublicKey('V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB'),
					DevnetSpotMarkets[0].mint // Devnet USDT
				);

				await faucet.createAssociatedTokenAccountAndMintTo(
					DEVNET_TEST_WALLET.publicKey,
					new BN(QUOTE_PRECISION.muln(1_000)) // 1000 USDT
				);
			} catch (e) {
				DEVNET_TEST_WALLET = getDevWallet().devWallet;
			}

			isTestWalletSetupCompleted = true;
		})().finally(() => {
			settingUpTestWalletPromise = null;
		});
	}

	await settingUpTestWalletPromise;
	return DEVNET_TEST_WALLET;
};

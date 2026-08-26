import { PublicKey, Connection } from '@solana/web3.js';
import {
	VelocityEnv,
	VelocityClient,
	Wallet,
	WalletV2,
} from '@velocity-exchange/sdk';
import { CentralServerVelocity } from '../../../../../src/velocity/Velocity/clients/CentralServerVelocity';
import { EnvironmentConstants } from '../../../../../src/EnvironmentConstants';
import { getDevWallet, getTestWallet } from '../../../../utils/wallet';
import { VersionedTransaction } from '@solana/web3.js';

export const defaultDevnetRpc: string = EnvironmentConstants.rpcs.dev[1].value;

export const defaultConnection: Connection = new Connection(
	defaultDevnetRpc,
	'confirmed'
);

export const invalidMockUserAccountPublicKey: PublicKey = new PublicKey(
	'11111111111111111111111111111114'
);

const config = {
	solanaRpcEndpoint: defaultDevnetRpc,
	velocityEnv: 'devnet' as VelocityEnv,
	supportedPerpMarkets: [0, 1, 2],
	supportedSpotMarkets: [0, 1, 2],
};

export const centralServerVelocity: CentralServerVelocity =
	new CentralServerVelocity(config);

export const velocityClient: VelocityClient = (centralServerVelocity as any)
	.velocityClient as VelocityClient;

let isSubscribed = false;
let originalConsoleWarn: typeof console.warn;

export async function setupTestContext(): Promise<{
	testWallet: WalletV2;
	devWallet: WalletV2;
}> {
	if (isSubscribed) {
		const testWallet = await getTestWallet();
		const devWallet = getDevWallet().devWallet;
		return {
			testWallet,
			devWallet,
		};
	}

	originalConsoleWarn = console.warn;
	console.warn = () => {};
	await centralServerVelocity.subscribe();
	const testWallet = await getTestWallet();
	isSubscribed = true;

	return {
		testWallet,
		devWallet: getDevWallet().devWallet,
	};
}

export async function teardownTestContext(): Promise<void> {
	if (!isSubscribed) return;
	await centralServerVelocity.unsubscribe();
	console.warn = originalConsoleWarn;
	isSubscribed = false;
}

export async function signAndSendTransaction(
	txn: VersionedTransaction,
	wallet: Wallet
): Promise<string> {
	const signedTxn = await wallet.signVersionedTransaction(txn);
	const txSig = await defaultConnection.sendTransaction(signedTxn);
	const latestBlockhash = await defaultConnection.getLatestBlockhash();
	await defaultConnection.confirmTransaction({
		signature: txSig,
		blockhash: latestBlockhash.blockhash,
		lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
	});
	return txSig;
}

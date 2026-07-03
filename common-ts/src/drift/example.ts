import * as anchor from '@coral-xyz/anchor';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { BN, loadKeypair } from '@velocity-exchange/sdk';
import { CentralServerVelocity } from './Velocity/clients/CentralServerVelocity';
import * as path from 'path';

// Load environment variables from .env file
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Example usage of CentralServerVelocity client
 *
 * This file contains multiple examples demonstrating how to:
 * 1. Set up an Anchor wallet with a private key
 * 2. Initialize a CentralServerVelocity instance
 * 3. Create and execute various transaction types
 *
 * Prerequisites:
 * - Create a .env file in the same directory as this example file with:
 *   ANCHOR_WALLET=[private key byte array]
 *   ENDPOINT=https://your-rpc-endpoint.com
 *
 * Usage:
 * - Run all examples: ts-node example.ts
 * - Run specific example: ts-node example.ts <example-name>
 *   Available examples: depositWithdraw, settleFunding, settlePnl
 */

// Shared configuration and setup
let centralServerVelocity: CentralServerVelocity;
let wallet: anchor.Wallet;
const userAccountPublicKey = new PublicKey('11111111111111111111111111111111'); // enter the publickey for the velocity account here

async function initializeCentralServerVelocity(): Promise<void> {
	console.log('🚀 Initializing CentralServerVelocity...\n');

	// Validate required environment variables
	if (!process.env.ANCHOR_WALLET) {
		throw new Error('ANCHOR_WALLET must be set');
	}

	if (!process.env.ENDPOINT) {
		throw new Error(
			'ENDPOINT environment variable must be set to your Solana RPC endpoint'
		);
	}

	// Set up the wallet
	wallet = new anchor.Wallet(loadKeypair(process.env.ANCHOR_WALLET as string));

	console.log(`✅ Wallet Public Key: ${wallet.publicKey.toString()}`);
	console.log(`✅ RPC Endpoint: ${process.env.ENDPOINT}\n`);

	// Initialize CentralServerVelocity
	console.log('🏗️  Initializing CentralServerVelocity...');
	centralServerVelocity = new CentralServerVelocity({
		solanaRpcEndpoint: process.env.ENDPOINT as string,
		velocityEnv: 'mainnet-beta', // Change to 'devnet' for devnet testing
		supportedPerpMarkets: [0, 1, 2], // SOL, BTC, ETH
		supportedSpotMarkets: [0, 1], // USDT, SOL
		additionalVelocityClientConfig: {
			// Optional: Add additional VelocityClient configuration
			txVersion: 0,
			txParams: {
				computeUnits: 200000,
				computeUnitsPrice: 1000,
			},
		},
	});

	console.log('✅ CentralServerVelocity instance created successfully\n');

	// Subscribe to market data
	console.log('📡 Subscribing to market data...');
	await centralServerVelocity.subscribe();
	console.log('✅ Successfully subscribed to market data\n');
}

/**
 * Reusable function to handle transaction signing and sending
 */
async function executeVersionedTransaction(
	txn: VersionedTransaction,
	transactionType: string
): Promise<void> {
	console.log(`✅ ${transactionType} transaction created successfully`);
	console.log(`📋 Transaction Type: ${txn.constructor.name}`);
	console.log('\n📝 Signing Transaction...');
	// Sign with the wallet's keypair
	txn.sign([wallet.payer]);

	console.log('✅ Transaction signed successfully');
	console.log(`  Signatures Count After Signing: ${txn.signatures.length}`);
	console.log(
		`  First Signature Present: ${
			txn.signatures[0] && txn.signatures[0].length > 0
		}`
	);

	console.log('\n🚀 Sending transaction to the network...');

	const txSig = await centralServerVelocity.sendSignedTransaction(txn);

	console.log('✅ Transaction sent successfully!');
	console.log(`📋 Transaction Signature: ${txSig}`);
	console.log(`🔍 View on Solscan: https://solscan.io/tx/${txSig}`);
}

/**
 * Example 1: Deposit and Withdraw transactions
 */
async function depositWithdrawExample() {
	console.log('🚀 Starting Deposit/Withdraw Example...\n');

	// Configuration for this example
	const amount = new BN(1000000); // 1 USDT (6 decimals)
	const spotMarketIndex = 0; // USDT market index

	// Example 1: Create a deposit transaction
	console.log('--- 📥 Creating Deposit Transaction ---');

	try {
		console.log(`💰 Deposit Amount: ${amount.toString()} raw units`);
		console.log(`🏪 Spot Market Index: ${spotMarketIndex}`);

		const depositTxn = await centralServerVelocity.getDepositTxn(
			userAccountPublicKey,
			amount,
			spotMarketIndex
		);

		await executeVersionedTransaction(
			depositTxn as VersionedTransaction,
			'Deposit'
		);
	} catch (error) {
		console.error('❌ Error during deposit transaction flow:', error);
	}

	// Example 2: Create a withdraw transaction
	console.log('\n--- 📤 Creating Withdraw Transaction ---');

	try {
		console.log(`💰 Withdraw Amount: ${amount.toString()} raw units`);
		console.log(`🏪 Spot Market Index: ${spotMarketIndex}`);

		const withdrawTxn = await centralServerVelocity.getWithdrawTxn(
			userAccountPublicKey,
			amount,
			spotMarketIndex,
			{
				isBorrow: false, // true = borrow, false = reduce-only withdraw
				isMax: false, // true = withdraw maximum available
			}
		);

		await executeVersionedTransaction(
			withdrawTxn as VersionedTransaction,
			'Withdraw'
		);
	} catch (error) {
		console.error('❌ Error during withdraw transaction flow:', error);
	}
}

/**
 * Example 2: Settle Funding Payments
 */
async function settleFundingExample() {
	console.log('🚀 Starting Settle Funding Example...\n');

	console.log('--- 💰 Creating Settle Funding Transaction ---');

	try {
		console.log(`👤 User Account: ${userAccountPublicKey.toString()}`);
		console.log('📋 Settling funding payments for all perp positions...');

		const settleFundingTxn = await centralServerVelocity.getSettleFundingTxn(
			userAccountPublicKey
		);

		await executeVersionedTransaction(
			settleFundingTxn as VersionedTransaction,
			'Settle Funding'
		);
	} catch (error) {
		console.error('❌ Error during settle funding transaction flow:', error);
	}
}

/**
 * Example 3: Settle PnL for Multiple Markets
 */
async function settlePnlExample() {
	console.log('🚀 Starting Settle PnL Example...\n');

	// Configuration for this example
	const marketIndexes = [1]; // BTC-PERP

	console.log('--- 📈 Creating Settle PnL Transaction ---');

	try {
		console.log(`👤 User Account: ${userAccountPublicKey.toString()}`);
		console.log(`📊 Market Indexes: ${marketIndexes.join(', ')}`);

		const settlePnlTxn = await centralServerVelocity.getSettlePnlTxn(
			userAccountPublicKey,
			marketIndexes
		);

		await executeVersionedTransaction(
			settlePnlTxn as VersionedTransaction,
			'Settle PnL'
		);
	} catch (error) {
		console.error('❌ Error during settle PnL transaction flow:', error);
	}
}

/**
 * Run all examples in sequence
 */
async function runAllExamples() {
	console.log('🚀 Running All CentralServerVelocity Examples...\n');

	await initializeCentralServerVelocity();

	console.log('='.repeat(50));
	await depositWithdrawExample();

	console.log('\n' + '='.repeat(50));
	await settleFundingExample();

	console.log('\n' + '='.repeat(50));
	await settlePnlExample();
}

// Export example functions for use in other files
export {
	initializeCentralServerVelocity,
	depositWithdrawExample,
	settleFundingExample,
	settlePnlExample,
	runAllExamples,
};

// Legacy export for backward compatibility
export const runCentralServerVelocityExample = runAllExamples;

// Helper functions for command line handling
function showUsage() {
	console.log('📋 Usage: ts-node example.ts [example-name]');
	console.log('\nAvailable examples:');
	console.log(
		'  depositWithdraw  - Run deposit and withdraw transaction examples'
	);
	console.log(
		'  settleFunding    - Run settle funding payment transaction example'
	);
	console.log('  settlePnl        - Run settle PnL transaction example');
	console.log('  all              - Run all examples in sequence (default)');
	console.log('\nExamples:');
	console.log('  ts-node example.ts                    # Run all examples');
	console.log(
		'  ts-node example.ts depositWithdraw    # Run only deposit/withdraw example'
	);
	console.log(
		'  ts-node example.ts settleFunding      # Run only settle funding example'
	);
	console.log(
		'  ts-node example.ts settlePnl          # Run only settle PnL example'
	);
}

async function runCliExample(exampleName: string) {
	const availableExamples = {
		depositWithdraw: () =>
			initializeCentralServerVelocity().then(() => depositWithdrawExample()),
		settleFunding: () =>
			initializeCentralServerVelocity().then(() => settleFundingExample()),
		settlePnl: () =>
			initializeCentralServerVelocity().then(() => settlePnlExample()),
		all: runAllExamples,
	};

	if (
		exampleName === 'help' ||
		exampleName === '--help' ||
		exampleName === '-h'
	) {
		showUsage();
		return;
	}

	const exampleToRun = exampleName
		? availableExamples[exampleName as keyof typeof availableExamples]
		: availableExamples['all'];

	if (!exampleToRun) {
		console.error(`❌ Unknown example: ${exampleName}`);
		console.error('');
		showUsage();
		process.exit(1);
	}

	console.log(`🚀 Running example: ${exampleName || 'all'}\n`);
	await exampleToRun();
}

// Command line argument handling
if (require.main === module) {
	const args = process.argv.slice(2);
	const exampleName = args[0];

	runCliExample(exampleName)
		.then(() => {
			console.log('\n✨ Example execution completed successfully!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('\n💥 Example execution failed:', error);
			process.exit(1);
		});
}

import * as anchor from '@coral-xyz/anchor';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
	BN,
	loadKeypair,
	PositionDirection,
	PostOnlyParams,
	SwapMode,
	BASE_PRECISION,
	QUOTE_PRECISION,
	PRICE_PRECISION,
	MainnetSpotMarkets,
	DevnetSpotMarkets,
	VelocityEnv,
} from '@velocity-exchange/sdk';
import { sign } from 'tweetnacl';
import { CentralServerVelocity } from './Velocity/clients/CentralServerVelocity';
import { ENUM_UTILS } from '../utils';
import { MAINNET_API_URLS } from './constants/apiUrls';
import * as path from 'path';
import {
	NonMarketOrderType,
	LimitOrderParamsOrderConfig,
	NonMarketOrderParamsConfig,
} from './base/actions/trade/openPerpOrder/types';
import {
	signSwiftOrderMsg,
	sendSwiftOrder,
	SwiftOrderMessage,
} from './base/actions/trade/openPerpOrder/openSwiftOrder';
import { ReferralParams } from './base/actions/user/create';
import { SwiftClient } from '../clients/swiftClient';
import { MarketId } from '../types';

// Load environment variables from .env file
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * CLI Tool for CentralServerVelocity client
 *
 * This CLI tool allows you to execute various Velocity protocol operations via command line
 * with human-readable parameters that are automatically converted to the proper precision.
 *
 * Prerequisites:
 * - Create a .env file in the same directory as this CLI file with:
 *   ANCHOR_WALLET=[private key byte array]
 *   ENDPOINT=https://your-rpc-endpoint.com
 *
 * Usage Examples:
 *   ts-node cli.ts deposit --marketIndex=0 --amount=2 --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts deposit --marketIndex=0 --amount=2 --userAccount=11111111111111111111111111111111 --fromWallet=22222222222222222222222222222222
 *   ts-node cli.ts withdraw --marketIndex=0 --amount=1.5 --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts settleFunding --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts settlePnl --marketIndexes=0,1 --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts openPerpMarketOrder --marketIndex=0 --direction=long --amount=0.1 --assetType=base --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts openPerpMarketOrderSwift --marketIndex=0 --direction=short --amount=100 --assetType=quote --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts openPerpNonMarketOrder --marketIndex=0 --direction=long --baseAssetAmount=0.1 --orderType=limit --limitPrice=100 --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts openPerpNonMarketOrderSwift --marketIndex=0 --direction=long --baseAssetAmount=0.1 --orderType=limit --limitPrice=99.5 --userAccount=11111111111111111111111111111111
 *   ts-node cli.ts editOrder --userAccount=11111111111111111111111111111111 --orderId=123 --newLimitPrice=105.5
 *   ts-node cli.ts cancelOrder --userAccount=11111111111111111111111111111111 --orderIds=123,456,789
 *   ts-node cli.ts cancelAllOrders --userAccount=11111111111111111111111111111111 --marketType=perp
 *   ts-node cli.ts swap --userAccount=11111111111111111111111111111111 --fromMarketIndex=1 --toMarketIndex=0 --fromAmount=1.5 --slippage=100 --swapMode=ExactIn
 *   ts-node cli.ts swap --userAccount=11111111111111111111111111111111 --fromMarketIndex=1 --toMarketIndex=0 --toAmount=150 --slippage=100 --swapMode=ExactOut
 *   ts-node cli.ts createUserAndDeposit --marketIndex=0 --amount=100 --accountName="Primary"
 *   ts-node cli.ts createUserAndDeposit --marketIndex=0 --amount=100 --fromWallet=22222222222222222222222222222222 --forAuthority=33333333333333333333333333333333
 */

// Shared configuration
let centralServerVelocity: CentralServerVelocity;
let wallet: anchor.Wallet;

interface CliArgs {
	[key: string]: string | string[];
}

/**
 * Parse command line arguments into a key-value object
 */
function parseArgs(args: string[]): CliArgs {
	const parsed: CliArgs = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const [key, value] = arg.substring(2).split('=');
			if (value !== undefined) {
				// Handle comma-separated arrays
				if (value.includes(',')) {
					parsed[key] = value.split(',');
				} else {
					parsed[key] = value;
				}
			} else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
				// Handle space-separated values
				const nextValue = args[i + 1];
				if (nextValue.includes(',')) {
					parsed[key] = nextValue.split(',');
				} else {
					parsed[key] = nextValue;
				}
				i++; // Skip the next argument as it's the value
			} else {
				parsed[key] = 'true'; // Boolean flag
			}
		}
	}

	return parsed;
}

/**
 * Convert human-readable amount to BN with proper precision
 */
function parseAmount(amount: string, precision: BN = QUOTE_PRECISION): BN {
	const floatAmount = parseFloat(amount);
	if (isNaN(floatAmount)) {
		throw new Error(`Invalid amount: ${amount}`);
	}

	// Convert to the proper precision
	const scaledAmount = Math.floor(floatAmount * precision.toNumber());
	return new BN(scaledAmount);
}

/**
 * Parse direction string to PositionDirection
 */
function parseDirection(direction: string): PositionDirection {
	const normalized = direction.toLowerCase();
	if (normalized === 'long' || normalized === 'buy') {
		return PositionDirection.LONG;
	} else if (normalized === 'short' || normalized === 'sell') {
		return PositionDirection.SHORT;
	} else {
		throw new Error(
			`Invalid direction: ${direction}. Use 'long', 'short', 'buy', or 'sell'`
		);
	}
}

/**
 * Parse post only string to PostOnlyParams
 */
function parsePostOnly(postOnly: string): PostOnlyParams {
	const normalized = postOnly.toLowerCase();
	switch (normalized) {
		case 'none':
		case 'false':
			return PostOnlyParams.NONE;
		case 'must_post_only':
		case 'true':
			return PostOnlyParams.MUST_POST_ONLY;
		case 'try_post_only':
			return PostOnlyParams.TRY_POST_ONLY;
		case 'slide':
			return PostOnlyParams.SLIDE;
		default:
			throw new Error(
				`Invalid post only: ${postOnly}. Use 'none', 'must_post_only', 'try_post_only', or 'slide'`
			);
	}
}

/**
 * Parse swap mode string to SwapMode
 */
function parseSwapMode(swapMode: string): SwapMode {
	const normalized = swapMode.toLowerCase();
	switch (normalized) {
		case 'exactin':
		case 'exact_in':
			return 'ExactIn';
		case 'exactout':
		case 'exact_out':
			return 'ExactOut';
		default:
			throw new Error(
				`Invalid swap mode: ${swapMode}. Use 'ExactIn' or 'ExactOut'`
			);
	}
}

/**
 * Get the precision for a spot market based on environment and market index
 */
function getMarketPrecision(
	marketIndex: number,
	isMainnet: boolean = true
): BN {
	const markets = isMainnet ? MainnetSpotMarkets : DevnetSpotMarkets;
	const market = markets.find((m) => m.marketIndex === marketIndex);

	if (!market) {
		console.warn(
			`⚠️  Market ${marketIndex} not found, using QUOTE_PRECISION as fallback`
		);
		return QUOTE_PRECISION;
	}

	return market.precision;
}

/**
 * Initialize CentralServerVelocity instance
 */
async function initializeCentralServerVelocity(): Promise<void> {
	console.log('🚀 Initializing CentralServerVelocity...\n');

	// Validate required environment variables
	if (!process.env.ANCHOR_WALLET) {
		throw new Error('ANCHOR_WALLET must be set in .env file');
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
	const velocityEnv = (process.env.DRIFT_ENV as VelocityEnv) ?? 'devnet';
	console.log(`🏗️  Initializing CentralServerVelocity... (${velocityEnv})`);
	const rpcEndpoint = process.env.ENDPOINT as string;
	centralServerVelocity = new CentralServerVelocity({
		solanaRpcEndpoint: rpcEndpoint,
		velocityEnv,
		supportedPerpMarkets: [0, 1, 2], // SOL, BTC, ETH
		supportedSpotMarkets: [0, 1], // USDT, SOL
		additionalVelocityClientConfig: {
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
 * Execute a regular transaction
 */
async function executeTransaction(
	txn: VersionedTransaction,
	transactionType: string
): Promise<void> {
	console.log(`✅ ${transactionType} transaction created successfully`);
	console.log('\n📝 Signing Transaction...');

	txn.sign([wallet.payer]);
	console.log('✅ Transaction signed successfully');

	console.log('\n🚀 Sending transaction to the network...');
	const { txSig } = await centralServerVelocity.sendSignedTransaction(txn);

	console.log('✅ Transaction sent successfully!');
	console.log(`📋 Transaction Signature: ${txSig?.toString()}`);
	console.log(`🔍 View on Solscan: https://solscan.io/tx/${txSig?.toString()}`);
}

/**
 * Signs and sends a SWIFT order message that was prepared by CentralServerVelocity.
 */
async function signAndSendSwiftOrderMessage(
	swiftMessage: SwiftOrderMessage,
	wallet: anchor.Wallet,
	centralServerVelocity: CentralServerVelocity,
	swiftServerUrl: string,
	orderType: string
): Promise<void> {
	console.log(`\n📝 Signing ${orderType} SWIFT message...`);

	const signedMessage = await signSwiftOrderMsg({
		wallet: {
			signMessage: async (message: Uint8Array) => {
				const signature = sign.detached(message, wallet.payer.secretKey);
				return new Uint8Array(signature);
			},
		},
		hexEncodedSwiftOrderMessage:
			swiftMessage.hexEncodedSwiftOrderMessage.uInt8Array,
		expirationTimeMs: swiftMessage.expirationTimeMs,
	});

	console.log('✅ Message signed successfully');

	SwiftClient.init(swiftServerUrl, 'common-ts-cli');

	const swiftOrderObservable = sendSwiftOrder({
		velocityClient: centralServerVelocity.velocityClient,
		marketId: MarketId.createPerpMarket(swiftMessage.marketIndex),
		hexEncodedSwiftOrderMessageString:
			swiftMessage.hexEncodedSwiftOrderMessage.string,
		signedMessage,
		signedMsgOrderUuid: swiftMessage.signedMsgOrderUuid,
		takerAuthority: wallet.publicKey,
		signingAuthority: wallet.publicKey,
		slotsTillAuctionEnd: swiftMessage.slotsTillAuctionEnd,
	});

	await new Promise<void>((resolve, reject) => {
		const subscription = swiftOrderObservable.subscribe({
			next: (event) => {
				if (event.type === 'sent') {
					console.log(`✅ ${orderType} Swift order submitted successfully`);
				}
				if (event.type === 'confirmed') {
					console.log('✅ Order confirmed!');
					console.log(`📋 Order ID: ${event.orderId}`);
					console.log(`📋 Hash: ${event.hash}`);
					subscription.unsubscribe();
					resolve();
				}
				if (event.type === 'expired') {
					console.error('⏰ Order expired:', event.message);
					subscription.unsubscribe();
					resolve();
				}
				if (event.type === 'errored') {
					console.error('❌ Order failed:', event.message);
					subscription.unsubscribe();
					resolve();
				}
			},
			error: (err) => {
				console.error('❌ Observable error:', err);
				reject(err);
			},
		});
	});

	console.log('🏁 Order monitoring completed');
}

/**
 * CLI Command: deposit
 */
async function depositCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const amount = args.amount as string;
	const fromWallet = args.fromWallet as string | undefined;

	if (!userAccount || isNaN(marketIndex) || !amount) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --amount'
		);
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const amountBN = parseAmount(amount, QUOTE_PRECISION); // Most deposits are USDT (quote precision)

	console.log('--- 📥 Deposit Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);

	// Parse external wallet if provided
	const externalWallet = fromWallet ? new PublicKey(fromWallet) : undefined;
	if (externalWallet) {
		console.log(`💼 From External Wallet: ${externalWallet.toBase58()}`);
	}

	const depositTxn = await centralServerVelocity.getDepositTxn(
		userAccountPubkey,
		amountBN,
		marketIndex,
		{
			externalWallet,
		}
	);

	await executeTransaction(depositTxn as VersionedTransaction, 'Deposit');
}

/**
 * CLI Command: createUserAndDeposit
 */
async function createUserAndDepositCommand(args: CliArgs): Promise<void> {
	const marketIndexArg = args.marketIndex as string;
	const amountArg = args.amount as string;
	const referrerName = args.referrerName as string | undefined;
	const referralEscrowNumOrdersArg = args.referralEscrowNumOrders as
		| string
		| undefined;
	const accountName = args.accountName as string | undefined;
	const poolIdArg = args.poolId as string | undefined;
	const fromSubAccountIdArg = args.fromSubAccountId as string | undefined;
	const customMaxMarginRatioArg = args.customMaxMarginRatio as
		| string
		| undefined;
	const fromWallet = args.fromWallet as string | undefined;
	const forAuthority = args.forAuthority as string | undefined;

	if (!marketIndexArg || !amountArg) {
		throw new Error('Required arguments: --marketIndex, --amount');
	}

	// If external wallet is provided, authority must also be specified
	if (fromWallet && !forAuthority) {
		throw new Error(
			'When using --fromWallet, you must also specify --forAuthority (the account owner)'
		);
	}

	const marketIndex = parseInt(marketIndexArg, 10);
	if (isNaN(marketIndex)) {
		throw new Error(`Invalid marketIndex: ${marketIndexArg}`);
	}

	const precision = getMarketPrecision(marketIndex, true);
	const amountBN = parseAmount(amountArg, precision);

	const options: {
		referral?: ReferralParams;
		accountName?: string;
		poolId?: number;
		fromSubAccountId?: number;
		customMaxMarginRatio?: number;
		externalWallet?: PublicKey;
	} = {};

	if (referrerName) {
		let escrowNumOrders: number | undefined;
		if (referralEscrowNumOrdersArg !== undefined) {
			escrowNumOrders = parseInt(referralEscrowNumOrdersArg, 10);
			if (isNaN(escrowNumOrders)) {
				throw new Error(
					`Invalid referralEscrowNumOrders: ${referralEscrowNumOrdersArg}`
				);
			}
		}
		options.referral = { name: referrerName, escrowNumOrders };
	}

	if (accountName) {
		options.accountName = accountName;
	}

	if (poolIdArg !== undefined) {
		const poolId = parseInt(poolIdArg, 10);
		if (isNaN(poolId)) {
			throw new Error(`Invalid poolId: ${poolIdArg}`);
		}
		options.poolId = poolId;
	}

	if (fromSubAccountIdArg !== undefined) {
		const fromSubAccountId = parseInt(fromSubAccountIdArg, 10);
		if (isNaN(fromSubAccountId)) {
			throw new Error(`Invalid fromSubAccountId: ${fromSubAccountIdArg}`);
		}
		options.fromSubAccountId = fromSubAccountId;
	}

	if (customMaxMarginRatioArg !== undefined) {
		const customMaxMarginRatio = parseFloat(customMaxMarginRatioArg);
		if (isNaN(customMaxMarginRatio)) {
			throw new Error(
				`Invalid customMaxMarginRatio: ${customMaxMarginRatioArg}`
			);
		}
		options.customMaxMarginRatio = customMaxMarginRatio;
	}

	// Parse external wallet and authority if provided
	const externalWallet = fromWallet ? new PublicKey(fromWallet) : undefined;
	const authority = forAuthority
		? new PublicKey(forAuthority)
		: wallet.publicKey;
	if (externalWallet) {
		options.externalWallet = externalWallet;
	}

	console.log('--- 🆕 Create User & Deposit Transaction ---');
	console.log(`🔑 Authority (account owner): ${authority.toString()}`);
	console.log(`🏪 Spot Market Index: ${marketIndex}`);
	console.log(
		`💰 Initial Deposit: ${amountArg} (${amountBN.toString()} raw units)`
	);
	if (options.accountName) {
		console.log(`📝 Account Name: ${options.accountName}`);
	}
	if (options.referral) {
		console.log(`🙌 Referrer Name: ${options.referral.name}`);
		if (options.referral.escrowNumOrders !== undefined) {
			console.log(
				`🎟️ Referral Escrow Orders: ${options.referral.escrowNumOrders}`
			);
		}
	}
	if (options.poolId !== undefined) {
		console.log(`🏊 Pool ID: ${options.poolId}`);
	}
	if (options.fromSubAccountId !== undefined) {
		console.log(`🔁 Funding From Subaccount ID: ${options.fromSubAccountId}`);
	}
	if (options.customMaxMarginRatio !== undefined) {
		console.log(`📐 Custom Max Margin Ratio: ${options.customMaxMarginRatio}`);
	}
	if (externalWallet) {
		console.log(`💼 From External Wallet: ${externalWallet.toBase58()}`);
	}

	const hasOptions = Object.keys(options).length > 0;
	const { transaction, userAccountPublicKey, subAccountId } =
		await centralServerVelocity.getCreateAndDepositTxn(
			authority,
			amountBN,
			marketIndex,
			hasOptions ? options : undefined
		);

	console.log(`🆔 New User Account: ${userAccountPublicKey.toString()}`);
	console.log(`🧾 Subaccount ID: ${subAccountId}`);

	await executeTransaction(
		transaction as VersionedTransaction,
		'Create User & Deposit'
	);
}

/**
 * CLI Command: withdraw
 */
async function withdrawCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const amount = args.amount as string;
	const isBorrow = args.isBorrow === 'true';
	const isMax = args.isMax === 'true';

	if (!userAccount || isNaN(marketIndex) || !amount) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --amount'
		);
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const amountBN = parseAmount(amount, QUOTE_PRECISION);

	console.log('--- 📤 Withdraw Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);
	console.log(`💳 Is Borrow: ${isBorrow}`);
	console.log(`📊 Is Max: ${isMax}`);

	const withdrawTxn = await centralServerVelocity.getWithdrawTxn(
		userAccountPubkey,
		amountBN,
		marketIndex,
		{ isBorrow, isMax }
	);

	await executeTransaction(withdrawTxn as VersionedTransaction, 'Withdraw');
}

/**
 * CLI Command: settleFunding
 */
async function settleFundingCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;

	if (!userAccount) {
		throw new Error('Required arguments: --userAccount');
	}

	const userAccountPubkey = new PublicKey(userAccount);

	console.log('--- 💰 Settle Funding Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);

	const settleFundingTxn = await centralServerVelocity.getSettleFundingTxn(
		userAccountPubkey
	);

	await executeTransaction(
		settleFundingTxn as VersionedTransaction,
		'Settle Funding'
	);
}

/**
 * CLI Command: settlePnl
 */
async function settlePnlCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndexesArg = args.marketIndexes;

	if (!userAccount || !marketIndexesArg) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndexes (comma-separated)'
		);
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const marketIndexes = Array.isArray(marketIndexesArg)
		? marketIndexesArg.map((idx) => parseInt(idx))
		: [parseInt(marketIndexesArg as string)];

	console.log('--- 📈 Settle PnL Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`📊 Market Indexes: ${marketIndexes.join(', ')}`);

	const settlePnlTxn = await centralServerVelocity.getSettlePnlTxn(
		userAccountPubkey,
		marketIndexes
	);

	await executeTransaction(settlePnlTxn as VersionedTransaction, 'Settle PnL');
}

/**
 * CLI Command: openPerpMarketOrder (regular transaction)
 */
async function openPerpMarketOrderCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const direction = args.direction as string;
	const amount = args.amount as string;
	const assetType = (args.assetType as string) || 'base';
	const dlobServerHttpUrl = MAINNET_API_URLS.DLOB;

	if (!userAccount || isNaN(marketIndex) || !direction || !amount) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --direction, --amount'
		);
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const directionEnum = parseDirection(direction);
	const precision = assetType === 'base' ? BASE_PRECISION : QUOTE_PRECISION;
	const amountBN = parseAmount(amount, precision);

	console.log('--- 🎯 Open Perp Order Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(
		`📊 Direction: ${direction} (${ENUM_UTILS.toStr(directionEnum)})`
	);
	console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);
	console.log(`💱 Asset Type: ${assetType}`);
	console.log(`🌐 DLOB Server: ${dlobServerHttpUrl}`);

	const orderTxn = await centralServerVelocity.getOpenPerpMarketOrderTxn({
		userAccountPublicKey: userAccountPubkey,
		assetType: assetType as 'base' | 'quote',
		marketIndex,
		direction: directionEnum,
		amount: amountBN,
		useSwift: false,
		positionMaxLeverage: 10,
	});

	await executeTransaction(orderTxn as VersionedTransaction, 'Open Perp Order');
}

/**
 * CLI Command: openPerpMarketOrderSwift (Swift signed message order)
 */
async function openPerpMarketOrderSwiftCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const direction = args.direction as string;
	const amount = args.amount as string;
	const assetType = (args.assetType as string) || 'base';
	const dlobServerHttpUrl = MAINNET_API_URLS.DLOB;
	const swiftServerUrl =
		(args.swiftServerUrl as string) || MAINNET_API_URLS.SWIFT;

	if (!userAccount || isNaN(marketIndex) || !direction || !amount) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --direction, --amount'
		);
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const directionEnum = parseDirection(direction);
	const precision = assetType === 'base' ? BASE_PRECISION : QUOTE_PRECISION;
	const amountBN = parseAmount(amount, precision);

	console.log('--- ⚡ Open Perp Order Swift ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(
		`📊 Direction: ${direction} (${ENUM_UTILS.toStr(directionEnum)})`
	);
	console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);
	console.log(`💱 Asset Type: ${assetType}`);
	console.log(`🌐 DLOB Server: ${dlobServerHttpUrl}`);
	console.log(`⚡ Swift Server: ${swiftServerUrl}`);
	console.log(`🔑 Wallet Public Key: ${wallet.publicKey.toString()}`);

	console.log('\n👁️  Monitoring order status...');

	try {
		const swiftMessage = await centralServerVelocity.getOpenPerpMarketOrderTxn({
			userAccountPublicKey: userAccountPubkey,
			assetType: assetType as 'base' | 'quote',
			marketIndex,
			direction: directionEnum,
			amount: amountBN,
			useSwift: true,
			positionMaxLeverage: 10,
		});

		await signAndSendSwiftOrderMessage(
			swiftMessage,
			wallet,
			centralServerVelocity,
			swiftServerUrl,
			'Open Perp Order'
		);
		console.log('✅ [CLI] Swift order finished');
	} catch (error) {
		console.error('❌ [CLI] Error creating Swift order:', error);
		throw error;
	}
}

/**
 * CLI Command: openPerpNonMarketOrder (regular limit/oracle order)
 */
async function openPerpNonMarketOrderCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const direction = args.direction as string;
	const amount = args.amount as string;
	const assetType = (args.assetType as string) || 'base';
	const baseAssetAmount = args.baseAssetAmount as string;
	const orderType = args.orderType as NonMarketOrderType;
	const limitPrice = args.limitPrice as string;
	const triggerPrice = args.triggerPrice as string;
	const reduceOnly = (args.reduceOnly as string) === 'true';
	const postOnly = (args.postOnly as string) || 'none';
	const oraclePriceOffset = args.oraclePriceOffset as string;

	if (!userAccount || isNaN(marketIndex) || !direction || !orderType) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --direction, --orderType'
		);
	}

	if (!amount && !baseAssetAmount) {
		throw new Error('Either --amount or --baseAssetAmount must be provided');
	}

	// Validate price requirements based on order type
	if (orderType === 'limit') {
		if (!limitPrice) {
			throw new Error(`Order type '${orderType}' requires --limitPrice`);
		}
	} else if (orderType === 'takeProfit' || orderType === 'stopLoss') {
		if (!triggerPrice) {
			throw new Error(`Order type '${orderType}' requires --triggerPrice`);
		}
	} else if (orderType === 'oracleLimit') {
		if (!oraclePriceOffset) {
			throw new Error(`Order type '${orderType}' requires --oraclePriceOffset`);
		}
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const directionEnum = parseDirection(direction);
	const postOnlyEnum = parsePostOnly(postOnly);
	const limitPriceBN = limitPrice
		? parseAmount(limitPrice, PRICE_PRECISION)
		: undefined;
	const triggerPriceBN = triggerPrice
		? parseAmount(triggerPrice, PRICE_PRECISION)
		: undefined;
	const oraclePriceOffsetBN = oraclePriceOffset
		? parseAmount(oraclePriceOffset, PRICE_PRECISION)
		: undefined;

	const orderConfig: NonMarketOrderParamsConfig['orderConfig'] =
		orderType === 'limit'
			? {
					orderType,
					limitPrice: limitPriceBN!,
			  }
			: orderType === 'takeProfit' || orderType === 'stopLoss'
			? {
					orderType,
					triggerPrice: triggerPriceBN!,
			  }
			: {
					orderType,
					oraclePriceOffset: oraclePriceOffsetBN!,
			  };

	console.log('--- 📋 Open Perp Non-Market Order ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(
		`📊 Direction: ${direction} (${ENUM_UTILS.toStr(directionEnum)})`
	);

	let amountBN: BN;
	if (amount) {
		const precision = assetType === 'base' ? BASE_PRECISION : QUOTE_PRECISION;
		amountBN = parseAmount(amount, precision);
		console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);
		console.log(`💱 Asset Type: ${assetType}`);
	} else {
		amountBN = parseAmount(baseAssetAmount, BASE_PRECISION);
		console.log(
			`💰 Base Asset Amount: ${baseAssetAmount} (${amountBN.toString()} raw units)`
		);
	}

	if (limitPriceBN) {
		console.log(
			`💵 Limit Price: ${limitPrice} (${limitPriceBN.toString()} raw units)`
		);
	}
	if (triggerPriceBN) {
		console.log(
			`🎯 Trigger Price: ${triggerPrice} (${triggerPriceBN.toString()} raw units)`
		);
	}
	console.log(`📝 Order Type: ${orderType}`);
	console.log(`🔄 Reduce Only: ${reduceOnly}`);
	console.log(`📌 Post Only: ${postOnly} (${ENUM_UTILS.toStr(postOnlyEnum)})`);

	const orderTxn = await centralServerVelocity.getOpenPerpNonMarketOrderTxn({
		userAccountPublicKey: userAccountPubkey,
		marketIndex,
		direction: directionEnum,
		orderConfig,
		useSwift: false,
		reduceOnly,
		postOnly: postOnlyEnum,
		assetType: assetType as 'base' | 'quote',
		amount: amountBN,
		positionMaxLeverage: 10,
	});

	await executeTransaction(
		orderTxn as VersionedTransaction,
		'Open Perp Non-Market Order'
	);
}

/**
 * CLI Command: openPerpNonMarketOrderSwift (Swift signed message limit order)
 */
async function openPerpNonMarketOrderSwiftCommand(
	args: CliArgs
): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketIndex = parseInt(args.marketIndex as string);
	const direction = args.direction as string;
	const amount = args.amount as string;
	const assetType = (args.assetType as string) || 'base';
	const baseAssetAmount = args.baseAssetAmount as string;
	const orderType = args.orderType as NonMarketOrderType;
	const limitPrice = args.limitPrice as string;
	const reduceOnly = (args.reduceOnly as string) === 'true';
	const postOnly = (args.postOnly as string) || 'none';
	const swiftServerUrl = MAINNET_API_URLS.SWIFT;

	if (!userAccount || isNaN(marketIndex) || !direction || !orderType) {
		throw new Error(
			'Required arguments: --userAccount, --marketIndex, --direction, --orderType'
		);
	}

	if (!amount && !baseAssetAmount) {
		throw new Error('Either --amount or --baseAssetAmount must be provided');
	}

	// Swift orders only support LIMIT order type
	if (orderType.toLowerCase() !== 'limit') {
		throw new Error('Swift orders only support LIMIT order type');
	}

	// LIMIT orders require limitPrice
	if (!limitPrice) {
		throw new Error('LIMIT orders require --limitPrice');
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const directionEnum = parseDirection(direction);
	const postOnlyEnum = parsePostOnly(postOnly);
	const limitPriceBN = parseAmount(limitPrice, PRICE_PRECISION);

	const orderConfig: LimitOrderParamsOrderConfig = {
		orderType: 'limit',
		limitPrice: limitPriceBN!,
	};

	console.log('--- ⚡ Open Perp Non-Market Order Swift ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Index: ${marketIndex}`);
	console.log(
		`📊 Direction: ${direction} (${ENUM_UTILS.toStr(directionEnum)})`
	);

	let amountBN: BN;
	if (amount) {
		const precision = assetType === 'base' ? BASE_PRECISION : QUOTE_PRECISION;
		amountBN = parseAmount(amount, precision);
		console.log(`💰 Amount: ${amount} (${amountBN.toString()} raw units)`);
		console.log(`💱 Asset Type: ${assetType}`);
	} else {
		amountBN = parseAmount(baseAssetAmount, BASE_PRECISION);
		console.log(
			`💰 Base Asset Amount: ${baseAssetAmount} (${amountBN.toString()} raw units)`
		);
	}

	console.log(
		`💵 Limit Price: ${limitPrice} (${limitPriceBN.toString()} raw units)`
	);
	console.log(`📝 Order Type: ${orderType})`);
	console.log(`🔄 Reduce Only: ${reduceOnly}`);
	console.log(`📌 Post Only: ${postOnly} (${ENUM_UTILS.toStr(postOnlyEnum)})`);
	console.log(`⚡ Swift Server: ${swiftServerUrl}`);
	console.log(`🔑 Wallet Public Key: ${wallet.publicKey.toString()}`);

	try {
		console.log('\n👁️  Monitoring order status...');

		const swiftMessage =
			await centralServerVelocity.getOpenPerpNonMarketOrderTxn({
				userAccountPublicKey: userAccountPubkey,
				marketIndex,
				direction: directionEnum,
				orderConfig,
				reduceOnly,
				postOnly: postOnlyEnum,
				assetType: assetType as 'base' | 'quote',
				amount: amountBN,
				useSwift: true,
				positionMaxLeverage: 10,
			});

		await signAndSendSwiftOrderMessage(
			swiftMessage,
			wallet,
			centralServerVelocity,
			swiftServerUrl,
			'Open Perp Non-Market Order'
		);

		console.log('✅ [CLI] Swift order finished');
	} catch (error) {
		console.error('❌ [CLI] Error creating Swift non-market order:', error);
		throw error;
	}
}

/**
 * Show CLI usage information
 */
function showUsage(): void {
	console.log('📋 Velocity CLI Usage');
	console.log('');
	console.log('Available Commands:');
	console.log('');

	console.log('💰 deposit');
	console.log(
		'  ts-node cli.ts deposit --userAccount=<pubkey> --marketIndex=<num> --amount=<num> [--fromWallet=<pubkey>]'
	);
	console.log(
		'  Example: ts-node cli.ts deposit --userAccount=11111111111111111111111111111111 --marketIndex=0 --amount=100'
	);
	console.log(
		'  Example (external wallet): ts-node cli.ts deposit --userAccount=11111111111111111111111111111111 --marketIndex=0 --amount=100 --fromWallet=22222222222222222222222222222222'
	);
	console.log('');

	console.log('🆕 createUserAndDeposit');
	console.log(
		'  ts-node cli.ts createUserAndDeposit --marketIndex=<num> --amount=<num> [--accountName=<string>] [--referrerName=<string>] [--referralEscrowNumOrders=<num>] [--poolId=<num>] [--fromSubAccountId=<num>] [--customMaxMarginRatio=<num>] [--fromWallet=<pubkey> --forAuthority=<pubkey>]'
	);
	console.log(
		'  Example: ts-node cli.ts createUserAndDeposit --marketIndex=0 --amount=100 --accountName="Primary"'
	);
	console.log(
		'  Example (external wallet): ts-node cli.ts createUserAndDeposit --marketIndex=0 --amount=100 --fromWallet=22222222222222222222222222222222 --forAuthority=33333333333333333333333333333333'
	);
	console.log('');

	console.log('💸 withdraw');
	console.log(
		'  ts-node cli.ts withdraw --userAccount=<pubkey> --marketIndex=<num> --amount=<num> [--isBorrow=<bool>] [--isMax=<bool>]'
	);
	console.log(
		'  Example: ts-node cli.ts withdraw --userAccount=11111111111111111111111111111111 --marketIndex=0 --amount=50'
	);
	console.log('');

	console.log('🏦 settleFunding');
	console.log('  ts-node cli.ts settleFunding --userAccount=<pubkey>');
	console.log(
		'  Example: ts-node cli.ts settleFunding --userAccount=11111111111111111111111111111111'
	);
	console.log('');

	console.log('📊 settlePnl');
	console.log(
		'  ts-node cli.ts settlePnl --userAccount=<pubkey> --marketIndexes=<comma-separated>'
	);
	console.log(
		'  Example: ts-node cli.ts settlePnl --userAccount=11111111111111111111111111111111 --marketIndexes=0,1'
	);
	console.log('');

	console.log('🎯 openPerpMarketOrder');
	console.log(
		'  ts-node cli.ts openPerpMarketOrder --userAccount=<pubkey> --marketIndex=<num> --direction=<long|short> --amount=<num> [--assetType=<base|quote>]'
	);
	console.log(
		'  Example: ts-node cli.ts openPerpMarketOrder --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --amount=0.1 --assetType=base'
	);
	console.log('');

	console.log('⚡ openPerpMarketOrderSwift');
	console.log(
		'  ts-node cli.ts openPerpMarketOrderSwift --userAccount=<pubkey> --marketIndex=<num> --direction=<long|short> --amount=<num> [--assetType=<base|quote>]'
	);
	console.log(
		'  Example: ts-node cli.ts openPerpMarketOrderSwift --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=short --amount=100 --assetType=quote'
	);
	console.log('');

	console.log('📋 openPerpNonMarketOrder');
	console.log(
		'  ts-node cli.ts openPerpNonMarketOrder --userAccount=<pubkey> --marketIndex=<num> --direction=<long|short> --amount=<num> [--assetType=<base|quote>] --orderType=<limit|trigger_limit|trigger_market|oracle> [--limitPrice=<num>] [--triggerPrice=<num>] [--reduceOnly=<true|false>] [--postOnly=<none|must_post_only|try_post_only|slide>]'
	);
	console.log(
		'  New LIMIT: ts-node cli.ts openPerpNonMarketOrder --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --amount=0.1 --assetType=base --orderType=limit --limitPrice=100'
	);
	console.log(
		'  New QUOTE: ts-node cli.ts openPerpNonMarketOrder --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --amount=100 --assetType=quote --orderType=limit --limitPrice=100'
	);
	console.log(
		'  Legacy: ts-node cli.ts openPerpNonMarketOrder --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --baseAssetAmount=0.1 --orderType=limit --limitPrice=100'
	);
	console.log('');

	console.log('⚡ openPerpNonMarketOrderSwift');
	console.log(
		'  ts-node cli.ts openPerpNonMarketOrderSwift --userAccount=<pubkey> --marketIndex=<num> --direction=<long|short> --amount=<num> [--assetType=<base|quote>] --orderType=limit --limitPrice=<num> [--reduceOnly=<true|false>] [--postOnly=<none|must_post_only|try_post_only|slide>]'
	);
	console.log(
		'  New: ts-node cli.ts openPerpNonMarketOrderSwift --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --amount=0.1 --assetType=base --orderType=limit --limitPrice=99.5'
	);
	console.log(
		'  Legacy: ts-node cli.ts openPerpNonMarketOrderSwift --userAccount=11111111111111111111111111111111 --marketIndex=0 --direction=long --baseAssetAmount=0.1 --orderType=limit --limitPrice=99.5'
	);
	console.log('');

	console.log('✏️ editOrder');
	console.log(
		'  ts-node cli.ts editOrder --userAccount=<pubkey> --orderId=<num> [--newDirection=<long|short>] [--newBaseAmount=<num>] [--newLimitPrice=<num>] [--newTriggerPrice=<num>] [--reduceOnly=<true|false>] [--postOnly=<true|false>]'
	);
	console.log(
		'  Example: ts-node cli.ts editOrder --userAccount=11111111111111111111111111111111 --orderId=123 --newLimitPrice=105.5'
	);
	console.log('');

	console.log('❌ cancelOrder');
	console.log(
		'  ts-node cli.ts cancelOrder --userAccount=<pubkey> --orderIds=<comma-separated-list>'
	);
	console.log(
		'  Example: ts-node cli.ts cancelOrder --userAccount=11111111111111111111111111111111 --orderIds=123,456,789'
	);
	console.log('');

	console.log('🧹 cancelAllOrders');
	console.log(
		'  ts-node cli.ts cancelAllOrders --userAccount=<pubkey> [--marketType=<perp|spot>] [--marketIndex=<num>] [--direction=<long|short>]'
	);
	console.log(
		'  Example: ts-node cli.ts cancelAllOrders --userAccount=11111111111111111111111111111111 --marketType=perp'
	);
	console.log('');

	console.log('🔄 swap');
	console.log(
		'  ts-node cli.ts swap --userAccount=<pubkey> --fromMarketIndex=<num> --toMarketIndex=<num> [--fromAmount=<num>] [--toAmount=<num>] [--slippage=<bps>] [--swapMode=<ExactIn|ExactOut>]'
	);
	console.log(
		'  ExactIn:  ts-node cli.ts swap --userAccount=11111111111111111111111111111111 --fromMarketIndex=1 --toMarketIndex=0 --fromAmount=1.5 --swapMode=ExactIn'
	);
	console.log(
		'  ExactOut: ts-node cli.ts swap --userAccount=11111111111111111111111111111111 --fromMarketIndex=1 --toMarketIndex=0 --toAmount=150 --swapMode=ExactOut'
	);
	console.log('');

	console.log('Options:');
	console.log('  --help, -h          Show this help message');
	console.log('');
	console.log('Notes:');
	console.log(
		'  - Amounts are in human-readable format (e.g., 1.5 USDT, 0.1 SOL)'
	);
	console.log('  - Direction can be: long, short, buy, sell');
	console.log(
		'  - Asset type: base (for native tokens like SOL) or quote (for USDT amounts)'
	);
	console.log('  - Swap modes:');
	console.log(
		'    * ExactIn: Specify --fromAmount (how much input token to swap)'
	);
	console.log(
		'    * ExactOut: Specify --toAmount (how much output token to receive)'
	);
	console.log('  - Ensure your .env file contains ANCHOR_WALLET and ENDPOINT');
}

/**
 * CLI Command: editOrder
 */
async function editOrderCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const orderId = parseInt(args.orderId as string);
	const newDirection = args.newDirection as string;
	const newBaseAmount = args.newBaseAmount as string;
	const newLimitPrice = args.newLimitPrice as string;
	const newTriggerPrice = args.newTriggerPrice as string;
	const reduceOnly = (args.reduceOnly as string) === 'true';
	const postOnly = (args.postOnly as string) === 'true';

	if (!userAccount || isNaN(orderId)) {
		throw new Error('Required arguments: --userAccount, --orderId');
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const editParams: any = {};

	if (newDirection) {
		editParams.newDirection = parseDirection(newDirection);
	}

	if (newBaseAmount) {
		editParams.newBaseAmount = parseAmount(newBaseAmount, BASE_PRECISION);
	}

	if (newLimitPrice) {
		editParams.newLimitPrice = parseAmount(newLimitPrice, PRICE_PRECISION);
	}

	if (newTriggerPrice) {
		editParams.newTriggerPrice = parseAmount(newTriggerPrice, PRICE_PRECISION);
	}

	if (reduceOnly) {
		editParams.reduceOnly = true;
	}

	if (postOnly) {
		editParams.postOnly = true;
	}

	console.log('--- ✏️ Edit Order ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🆔 Order ID: ${orderId}`);
	console.log(`📝 Edit Parameters:`, editParams);

	const editOrderTxn = await centralServerVelocity.getEditOrderTxn(
		userAccountPubkey,
		orderId,
		editParams
	);

	await executeTransaction(editOrderTxn as VersionedTransaction, 'Edit Order');
}

/**
 * CLI Command: cancelOrder
 */
async function cancelOrderCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const orderIds = args.orderIds as string;

	if (!userAccount || !orderIds) {
		throw new Error('Required arguments: --userAccount, --orderIds');
	}

	const userAccountPubkey = new PublicKey(userAccount);
	const orderIdArray = orderIds.split(',').map((id) => parseInt(id.trim()));

	console.log('--- ❌ Cancel Orders ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🆔 Order IDs: ${orderIdArray.join(', ')}`);

	const cancelOrderTxn = await centralServerVelocity.getCancelOrdersTxn(
		userAccountPubkey,
		orderIdArray
	);

	await executeTransaction(
		cancelOrderTxn as VersionedTransaction,
		'Cancel Orders'
	);
}

/**
 * CLI Command: cancelAllOrders
 */
async function cancelAllOrdersCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const marketType = args.marketType as string;
	const marketIndex = args.marketIndex
		? parseInt(args.marketIndex as string)
		: undefined;
	const direction = args.direction as string;

	if (!userAccount) {
		throw new Error('Required arguments: --userAccount');
	}

	const userAccountPubkey = new PublicKey(userAccount);
	let marketTypeEnum = undefined;
	let directionEnum = undefined;

	if (marketType) {
		marketTypeEnum =
			marketType.toLowerCase() === 'perp' ? { perp: {} } : { spot: {} };
	}

	if (direction) {
		directionEnum = parseDirection(direction);
	}

	console.log('--- 🧹 Cancel All Orders ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`🏪 Market Type Filter: ${marketType || 'none'}`);
	console.log(
		`📊 Market Index Filter: ${
			marketIndex !== undefined ? marketIndex : 'none'
		}`
	);
	console.log(`📈 Direction Filter: ${direction || 'none'}`);

	const cancelAllOrdersTxn = await centralServerVelocity.getCancelAllOrdersTxn(
		userAccountPubkey,
		marketTypeEnum,
		marketIndex,
		directionEnum
	);

	await executeTransaction(
		cancelAllOrdersTxn as VersionedTransaction,
		'Cancel All Orders'
	);
}

/**
 * CLI Command: swap
 */
async function swapCommand(args: CliArgs): Promise<void> {
	const userAccount = args.userAccount as string;
	const fromMarketIndex = parseInt(args.fromMarketIndex as string);
	const toMarketIndex = parseInt(args.toMarketIndex as string);
	const fromAmount = args.fromAmount as string;
	const toAmount = args.toAmount as string;
	const slippage = args.slippage ? parseInt(args.slippage as string) : 10; // Default 0.1%
	const swapMode = (args.swapMode as string) || 'ExactIn';

	if (!userAccount || isNaN(fromMarketIndex) || isNaN(toMarketIndex)) {
		throw new Error(
			'Required arguments: --userAccount, --fromMarketIndex, --toMarketIndex'
		);
	}

	const swapModeEnum = parseSwapMode(swapMode);

	// Validate amount parameters based on swap mode
	if (swapModeEnum === 'ExactIn') {
		if (!fromAmount) {
			throw new Error('ExactIn swap mode requires --fromAmount');
		}
		if (toAmount) {
			console.warn(
				'⚠️  Warning: --toAmount ignored in ExactIn mode, using --fromAmount'
			);
		}
	} else if (swapModeEnum === 'ExactOut') {
		if (!toAmount) {
			throw new Error('ExactOut swap mode requires --toAmount');
		}
		if (fromAmount) {
			console.warn(
				'⚠️  Warning: --fromAmount ignored in ExactOut mode, using --toAmount'
			);
		}
	}

	const userAccountPubkey = new PublicKey(userAccount);

	// Use the appropriate amount based on swap mode
	const amount = swapModeEnum === 'ExactIn' ? fromAmount : toAmount;

	// Determine which market to use for precision (input market for ExactIn, output market for ExactOut)
	const precisionMarketIndex =
		swapModeEnum === 'ExactIn' ? fromMarketIndex : toMarketIndex;

	// Get the appropriate precision for the amount based on the market
	const precision = getMarketPrecision(precisionMarketIndex, true);
	const amountBN = parseAmount(amount, precision);

	console.log('--- 🔄 Swap Transaction ---');
	console.log(`👤 User Account: ${userAccount}`);
	console.log(`📤 From Market Index: ${fromMarketIndex}`);
	console.log(`📥 To Market Index: ${toMarketIndex}`);
	console.log(`🔄 Swap Mode: ${swapMode}`);
	console.log(
		`🎯 Using precision from market ${precisionMarketIndex}: ${precision.toString()}`
	);

	if (swapModeEnum === 'ExactIn') {
		console.log(
			`💰 From Amount: ${fromAmount} (${amountBN.toString()} raw units)`
		);
		console.log(`💰 To Amount: Will be calculated based on quote`);
	} else {
		console.log(`💰 From Amount: Will be calculated based on quote`);
		console.log(`💰 To Amount: ${toAmount} (${amountBN.toString()} raw units)`);
	}

	console.log(`📊 Slippage: ${slippage} BPS (${slippage / 100}%)`);

	const swapTxn = await centralServerVelocity.getSwapTxn(
		userAccountPubkey,
		fromMarketIndex,
		toMarketIndex,
		amountBN,
		{
			slippageBps: slippage,
			swapMode: swapModeEnum,
		}
	);

	await executeTransaction(swapTxn as VersionedTransaction, 'Swap');
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (
		args.length === 0 ||
		args[0] === '--help' ||
		args[0] === '-h' ||
		args[0] === 'help'
	) {
		showUsage();
		return;
	}

	const command = args[0];
	const parsedArgs = parseArgs(args.slice(1));

	// Initialize the client first
	await initializeCentralServerVelocity();

	// Route to appropriate command
	switch (command) {
		case 'createUserAndDeposit':
			await createUserAndDepositCommand(parsedArgs);
			break;
		case 'deposit':
			await depositCommand(parsedArgs);
			break;
		case 'withdraw':
			await withdrawCommand(parsedArgs);
			break;
		case 'settleFunding':
			await settleFundingCommand(parsedArgs);
			break;
		case 'settlePnl':
			await settlePnlCommand(parsedArgs);
			break;
		case 'openPerpMarketOrder':
			await openPerpMarketOrderCommand(parsedArgs);
			break;
		case 'openPerpMarketOrderSwift':
			await openPerpMarketOrderSwiftCommand(parsedArgs);
			break;
		case 'openPerpNonMarketOrder':
			await openPerpNonMarketOrderCommand(parsedArgs);
			break;
		case 'openPerpNonMarketOrderSwift':
			await openPerpNonMarketOrderSwiftCommand(parsedArgs);
			break;
		case 'editOrder':
			await editOrderCommand(parsedArgs);
			break;
		case 'cancelOrder':
			await cancelOrderCommand(parsedArgs);
			break;
		case 'cancelAllOrders':
			await cancelAllOrdersCommand(parsedArgs);
			break;
		case 'swap':
			await swapCommand(parsedArgs);
			break;
		default:
			console.error(`❌ Unknown command: ${command}`);
			console.error('');
			showUsage();
			process.exit(1);
	}
}

// Run CLI if this file is executed directly
if (require.main === module) {
	main()
		.then(() => {
			console.log('\n✨ Command executed successfully!');
			// Don't exit immediately for Swift orders (they need time to process)
			setTimeout(() => process.exit(0), 2000);
		})
		.catch((error) => {
			console.error('\n💥 Command failed:', error.message || error);
			process.exit(1);
		});
}

export { main, parseArgs, parseAmount, parseDirection, parseSwapMode };

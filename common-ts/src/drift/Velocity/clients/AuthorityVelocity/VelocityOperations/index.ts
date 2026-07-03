import {
	BigNum,
	VelocityClient,
	JupiterClient,
	MarketType,
	MAX_LEVERAGE_ORDER_SIZE,
	QuoteResponse,
	SwapMode,
	TxParams,
	UnifiedSwapClient,
	User,
	UserStatsAccount,
	ZERO,
} from '@velocity-exchange/sdk';
import { TransactionSignature } from '@solana/web3.js';
import { getMarketConfig } from '../../../../../utils/markets/config';
import { MAIN_POOL_ID } from '../../../../../constants';
import { convertLeverageToMarginRatio } from '../../../../../utils/trading/leverage';
import { UserAccountCache } from '../../../stores/UserAccountCache';
import { createDepositTxn } from '../../../../base/actions/spot/deposit';
import { createUserAndDepositCollateralBaseTxn } from '../../../../base/actions/user/create';
import { createWithdrawTxn } from '../../../../base/actions/spot/withdraw';
import { deleteUserTxn } from '../../../../base/actions/user/delete';
import { createSettlePnlTxn } from '../../../../base/actions/perp/settlePnl';
import {
	CreateUserAndDepositParams,
	DepositParams,
	WithdrawParams,
	PerpOrderParams,
	SwapParams,
	SettleAccountPnlParams,
	CancelOrdersParams,
	CreateRevenueShareEscrowParams,
} from './types';
import { createCancelOrdersTxn } from '../../../../base/actions/trade/cancelOrder';
import {
	createOpenPerpMarketOrder,
	OpenPerpMarketOrderParams,
} from '../../../../base/actions/trade/openPerpOrder/openPerpMarketOrder';
import { createSwapTxn } from '../../../../base/actions/trade/swap';
import { createOpenPerpNonMarketOrder } from '../../../../base/actions/trade/openPerpOrder/openPerpNonMarketOrder';
import { createRevenueShareEscrowTxn } from '../../../../base/actions/builder/createRevenueShareEscrow';

/**
 * Handles majority of the relevant operations on the Velocity program including deposits,
 * withdrawals, position management, and trading operations.
 *
 * This class encapsulates the trading logic and provides a clean API for
 * executing various trading operations while handling common patterns like
 * token address resolution and transaction preparation.
 */
export class VelocityOperations {
	static readonly DEFAULT_TX_PARAMS: TxParams = {
		computeUnitsPrice: 50_000,
		useSimulatedComputeUnits: true,
		computeUnitsBufferMultiplier: 1.3,
	};

	static readonly MAX_COMPUTE_UNITS_PRICE = 1e15 / 10 / 1_400_000; // 1e15 = 1 SOL worth of micro lamports; 1e15 / 10 = 0.1 SOL worth of micro lamports; 1.4M = max compute units;

	/**
	 * Creates a new VelocityOperations instance.
	 *
	 * @param velocityClient - The VelocityClient instance for executing transactions
	 * @param getUserAccountCache - Function to get the user account cache. We lazily load the user account cache, so that we always get the latest user account data.
	 * @param getPriorityFee - Function to get current priority fee in micro lamports
	 */
	constructor(
		private velocityClient: VelocityClient,
		private getUserAccountCache: () => UserAccountCache,
		private dlobServerHttpUrl: string,
		private swiftServerUrl: string,
		private getPriorityFee: () => number
	) {}

	/**
	 * Gets transaction parameters with dynamic priority fees.
	 * Falls back to default if priority fee function is not available.
	 */
	getTxParams(overrides?: Partial<TxParams>): TxParams {
		const unsafePriorityFee = Math.floor(
			this.getPriorityFee() ??
				VelocityOperations.DEFAULT_TX_PARAMS.computeUnitsPrice
		);

		const safePriorityFee = Math.min(
			unsafePriorityFee,
			VelocityOperations.MAX_COMPUTE_UNITS_PRICE
		);

		return {
			...VelocityOperations.DEFAULT_TX_PARAMS,
			computeUnitsPrice: safePriorityFee,
			...overrides,
		};
	}

	/**
	 * Creates a new user account and deposits initial collateral.
	 *
	 * This method handles the complete onboarding flow for new users including:
	 * - Validating that the subaccount doesn't already exist
	 * - Resolving referrer information if provided
	 * - Getting the correct token address for deposits
	 * - Creating the user account with custom leverage settings
	 * - Subscribing to the new user's account updates
	 *
	 * @param params - The parameters for user creation and initial deposit
	 * @returns Promise resolving to transaction signature and user account public key
	 *
	 * @throws Error if subaccount already exists
	 *
	 * @example
	 * ```typescript
	 * const result = await tradingOps.createUserAndDeposit({
	 *   depositAmount: new BigNum(100),
	 *   depositSpotMarketIndex: 0, // USDT
	 *   name: "Trading Account",
	 *   maxLeverage: 5,
	 *   subAccountId: 0
	 * });
	 * ```
	 */
	async createUserAndDeposit(params: CreateUserAndDepositParams): Promise<{
		txSig: TransactionSignature;
		user: User;
	}> {
		const {
			depositAmount,
			depositSpotMarketIndex,
			newAccountName,
			maxLeverage,
			poolId = MAIN_POOL_ID,
			referral,
		} = params;

		const spotMarketConfig = getMarketConfig(
			this.velocityClient.env,
			MarketType.SPOT,
			depositSpotMarketIndex
		);

		const customMaxMarginRatio = convertLeverageToMarginRatio(maxLeverage ?? 0);

		let userStatsAccount: UserStatsAccount | undefined = undefined;

		try {
			userStatsAccount = this.velocityClient.userStats?.getAccount();
		} catch (error) {
			// ignore
		}

		const { transaction, subAccountId } =
			await createUserAndDepositCollateralBaseTxn({
				velocityClient: this.velocityClient,
				amount: depositAmount.val,
				spotMarketConfig: spotMarketConfig,
				authority: this.velocityClient.wallet.publicKey,
				userStatsAccount: userStatsAccount,
				accountName: newAccountName,
				referral,
				customMaxMarginRatio,
				poolId,
				txParams: this.getTxParams(),
			});

		const { txSig } = await this.velocityClient.sendTransaction(transaction);

		await this.velocityClient.addUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		); // adds user to velocityclient's user map, subscribes to user account data
		const user = this.velocityClient.getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);

		user.eventEmitter.on('update', () => {
			this.getUserAccountCache().updateUserAccount(user);
		});

		return {
			txSig,
			user,
		};
	}

	/**
	 * Creates a RevenueShareEscrow account for the user.
	 *
	 * @param params - The parameters for creating a RevenueShareEscrow account
	 * @returns Promise resolving to the transaction signature of the creation
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.createRevenueShareEscrow({
	 *   numOrders: 16,
	 *   builder: {
	 *     builderAuthority: new PublicKey("builderAuthority"),
	 *     maxFeeTenthBps: 100,
	 *   },
	 * });
	 * ```
	 */
	async createRevenueShareEscrow(
		params: CreateRevenueShareEscrowParams
	): Promise<TransactionSignature> {
		const txn = await createRevenueShareEscrowTxn({
			velocityClient: this.velocityClient,
			authority: this.velocityClient.wallet.publicKey,
			numOrders: params.numOrders ?? 16,
			builder: params.builder,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(txn);

		return txSig;
	}

	/**
	 * Deletes a user account.
	 *
	 * This method removes a user's sub-account from the Velocity.
	 *
	 * @param subAccountId - The ID of the sub-account to delete
	 * @returns A promise that resolves to the transaction signature of the deletion
	 *
	 * @throws {Error} When the user account is not found in the cache
	 *
	 * @example
	 * ```typescript
	 * // Delete user sub-account with ID 0
	 * const txSignature = await tradingOps.deleteUser(0);
	 * console.log('User deleted with transaction:', txSignature);
	 * ```
	 */
	async deleteUser(subAccountId: number): Promise<TransactionSignature> {
		const user = this.getUserAccountCache().getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);
		const userStatsAccount = this.velocityClient.userStats?.getAccount();

		if (!user) {
			throw new Error('User not found');
		}

		if (!userStatsAccount) {
			throw new Error('User stats account not found');
		}

		const deleteTxn = await deleteUserTxn({
			velocityClient: this.velocityClient,
			user: user.userClient,
			userStatsAccount,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(deleteTxn);

		return txSig;
	}

	/**
	 * Deposits collateral into a user's spot market position.
	 *
	 * This method handles depositing tokens into a user's account, with optional
	 * support for max borrow repayment scenarios where the deposit amount may be
	 * over-estimated to ensure complete repayment of borrowed funds.
	 *
	 * @param params - The deposit parameters
	 * @returns Promise resolving to the transaction signature
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.deposit({
	 *   subAccountId: 0,
	 *   amount: new BigNum(50),
	 *   spotMarketIndex: 0, // USDT
	 *   isMaxBorrowRepayment: false
	 * });
	 * ```
	 */
	async deposit(params: DepositParams): Promise<TransactionSignature> {
		const { subAccountId, amount, spotMarketIndex, isMaxBorrowRepayment } =
			params;

		const spotMarketConfig = getMarketConfig(
			this.velocityClient.env,
			MarketType.SPOT,
			spotMarketIndex
		);

		const user = this.getUserAccountCache().getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!user) {
			throw new Error('User not found');
		}

		const depositTxn = await createDepositTxn({
			velocityClient: this.velocityClient,
			user: user.userClient,
			amount: amount,
			spotMarketConfig: spotMarketConfig,
			isMaxBorrowRepayment,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(depositTxn);

		return txSig;
	}

	/**
	 * Withdraws collateral from a user's spot market position.
	 *
	 * This method handles withdrawing tokens from a user's account with options
	 * for borrowing (if allowBorrow is true) or reduce-only withdrawals. For max
	 * withdrawals with reduce-only, the amount is over-estimated to ensure
	 * complete withdrawal.
	 *
	 * @param params - The withdrawal parameters
	 * @returns Promise resolving to the transaction signature
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.withdraw({
	 *   subAccountId: 0,
	 *   amount: new BigNum(25),
	 *   spotMarketIndex: 0, // USDT
	 *   allowBorrow: false,
	 *   isMax: false
	 * });
	 * ```
	 */
	async withdraw(params: WithdrawParams): Promise<TransactionSignature> {
		const {
			subAccountId,
			amount,
			spotMarketIndex,
			isBorrow = false,
			isMax = false,
		} = params;

		const spotMarketConfig = getMarketConfig(
			this.velocityClient.env,
			MarketType.SPOT,
			spotMarketIndex
		);

		const accountData = this.getUserAccountCache().getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!accountData) {
			throw new Error('User not found');
		}

		const withdrawTxn = await createWithdrawTxn({
			velocityClient: this.velocityClient,
			amount,
			spotMarketConfig,
			user: accountData.userClient,
			isBorrow,
			isMax,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(withdrawTxn);

		return txSig;
	}

	/**
	 * Opens a perpetual market order (placeholder for future implementation).
	 *
	 * This method will handle opening long or short positions in perpetual markets
	 * with support for market and limit orders, reduce-only orders, and post-only orders.
	 *
	 * @param params - The perp order parameters
	 * @returns Promise resolving to the transaction signature
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.openPerpMarketOrder({
	 *   marketIndex: 0, // SOL-PERP
	 *   direction: 'long',
	 *   baseAssetAmount: new BigNum(1), // 1 SOL
	 *   orderType: 'market',
	 *   subAccountId: 0
	 * });
	 * ```
	 */
	async openPerpOrder(
		params: PerpOrderParams
	): Promise<TransactionSignature | void> {
		const accountData = this.getUserAccountCache().getUser(
			params.subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!accountData) {
			throw new Error('User not found');
		}

		const user = accountData.userClient;

		const processBracketOrders = (bracketOrdersInput?: {
			takeProfitPrice?: BigNum;
			stopLossPrice?: BigNum;
		}) => {
			const bracketOrders: OpenPerpMarketOrderParams['bracketOrders'] = {};

			if (bracketOrdersInput?.takeProfitPrice) {
				bracketOrders.takeProfit = {
					triggerPrice: bracketOrdersInput.takeProfitPrice.val,
					baseAssetAmount: params.size.val,
				};
			}

			if (bracketOrdersInput?.stopLossPrice) {
				bracketOrders.stopLoss = {
					triggerPrice: bracketOrdersInput.stopLossPrice.val,
					baseAssetAmount: params.size.val,
				};
			}

			return bracketOrders;
		};

		const amountBN = params.isMaxLeverage
			? MAX_LEVERAGE_ORDER_SIZE
			: params.size.val;

		switch (params.orderConfig.orderType) {
			case 'market': {
				const useSwift = !params.orderConfig.disableSwift;

				const bracketOrders = processBracketOrders(
					params.orderConfig.bracketOrders
				);

				// we split the logic for SWIFT and non-SWIFT orders to achieve better type inference
				if (useSwift) {
					const swiftOrderResult = await createOpenPerpMarketOrder({
						velocityClient: this.velocityClient,
						user,
						assetType: params.assetType,
						useSwift: true,
						swiftOptions: {
							wallet: {
								// @ts-ignore TODO: we might want to add signMessage to the IWallet interface
								signMessage: this.velocityClient.wallet.signMessage,
								takerAuthority: this.velocityClient.wallet.publicKey,
								signingAuthority: this.velocityClient.wallet.publicKey,
							},
							swiftServerUrl: this.swiftServerUrl,
							...params.orderConfig.swiftOptions,
						},
						direction: params.direction,
						amount: amountBN,
						bracketOrders,
						dlobServerHttpUrl: this.dlobServerHttpUrl,
						marketIndex: params.marketIndex,
						optionalAuctionParamsInputs:
							params.orderConfig.optionalAuctionParamsInputs,
						builderParams: params.builderParams,
						positionMaxLeverage: params.positionMaxLeverage,
						marginMode: params.marginMode,
						isolatedPositionDepositsOverride:
							params.isolatedPositionDepositsOverride,
					});

					return swiftOrderResult;
				} else {
					const result = await createOpenPerpMarketOrder({
						velocityClient: this.velocityClient,
						user,
						assetType: params.assetType,
						marketIndex: params.marketIndex,
						direction: params.direction,
						amount: amountBN,
						bracketOrders,
						optionalAuctionParamsInputs:
							params.orderConfig.optionalAuctionParamsInputs,
						dlobServerHttpUrl: this.dlobServerHttpUrl,
						useSwift: false,
						positionMaxLeverage: params.positionMaxLeverage,
						marginMode: params.marginMode,
						isolatedPositionDepositsOverride:
							params.isolatedPositionDepositsOverride,
					});

					const { txSig } = await this.velocityClient.sendTransaction(result);

					return txSig;
				}
			}
			case 'limit': {
				const useSwift = !params.orderConfig.disableSwift;

				const bracketOrders = processBracketOrders(
					params.orderConfig.bracketOrders
				);

				// we split the logic for SWIFT and non-SWIFT orders to achieve better type inference
				if (useSwift) {
					const swiftOrderResult = await createOpenPerpNonMarketOrder({
						velocityClient: this.velocityClient,
						user,
						direction: params.direction,
						marketIndex: params.marketIndex,
						amount: amountBN,
						assetType: params.assetType,
						orderConfig: {
							orderType: 'limit',
							limitPrice: params.orderConfig.limitPrice.val,
							bracketOrders,
						},
						reduceOnly: params.reduceOnly,
						postOnly: params.postOnly,
						useSwift: true,
						swiftOptions: {
							wallet: {
								// @ts-ignore TODO: we might want to add signMessage to the IWallet interface
								signMessage: this.velocityClient.wallet.signMessage,
								takerAuthority: this.velocityClient.wallet.publicKey,
								signingAuthority: this.velocityClient.wallet.publicKey,
							},
							swiftServerUrl: this.swiftServerUrl,
							...params.orderConfig.swiftOptions,
						},
						builderParams: params.builderParams,
						positionMaxLeverage: params.positionMaxLeverage,
						marginMode: params.marginMode,
						isolatedPositionDepositsOverride:
							params.isolatedPositionDepositsOverride,
					});

					return swiftOrderResult;
				} else {
					const txn = await createOpenPerpNonMarketOrder({
						velocityClient: this.velocityClient,
						user,
						direction: params.direction,
						marketIndex: params.marketIndex,
						amount: amountBN,
						assetType: params.assetType,
						orderConfig: {
							orderType: 'limit',
							limitPrice: params.orderConfig.limitPrice.val,
							bracketOrders,
						},
						reduceOnly: params.reduceOnly,
						postOnly: params.postOnly,
						useSwift: false,
						txParams: this.getTxParams(),
						positionMaxLeverage: params.positionMaxLeverage,
						marginMode: params.marginMode,
						isolatedPositionDepositsOverride:
							params.isolatedPositionDepositsOverride,
					});

					const { txSig } = await this.velocityClient.sendTransaction(txn);

					return txSig;
				}
			}
			case 'takeProfit':
			case 'stopLoss': {
				const txn = await createOpenPerpNonMarketOrder({
					velocityClient: this.velocityClient,
					user,
					direction: params.direction,
					marketIndex: params.marketIndex,
					amount: amountBN,
					assetType: params.assetType,
					orderConfig: {
						orderType: params.orderConfig.orderType,
						triggerPrice: params.orderConfig.triggerPrice.val,
						limitPrice: params.orderConfig.limitPrice?.val ?? ZERO,
					},
					reduceOnly: params.reduceOnly,
					useSwift: false,
					txParams: this.getTxParams(),
					positionMaxLeverage: params.positionMaxLeverage,
				});

				const { txSig } = await this.velocityClient.sendTransaction(txn);

				return txSig;
			}
			case 'oracleLimit': {
				const txn = await createOpenPerpNonMarketOrder({
					velocityClient: this.velocityClient,
					user,
					direction: params.direction,
					marketIndex: params.marketIndex,
					amount: amountBN,
					assetType: params.assetType,
					orderConfig: {
						orderType: 'oracleLimit',
						oraclePriceOffset: params.orderConfig.oraclePriceOffset.val,
					},
					reduceOnly: params.reduceOnly,
					useSwift: false,
					txParams: this.getTxParams(),
					positionMaxLeverage: params.positionMaxLeverage,
				});

				const { txSig } = await this.velocityClient.sendTransaction(txn);

				return txSig;
			}
			default: {
				const _exhaustiveCheck: never = params.orderConfig;
				throw new Error('Invalid order type');
			}
		}
	}

	async getSwapQuote(
		params: Omit<SwapParams, 'quote'> & {
			slippageBps?: number;
			swapMode?: SwapMode;
			onlyDirectRoutes?: boolean;
		}
	): Promise<QuoteResponse> {
		const jupiterClient = new JupiterClient({
			connection: this.velocityClient.connection,
		});

		const inputMint = getMarketConfig(
			this.velocityClient.env,
			MarketType.SPOT,
			params.fromMarketIndex
		).mint;
		const outputMint = getMarketConfig(
			this.velocityClient.env,
			MarketType.SPOT,
			params.toMarketIndex
		).mint;

		const jupiterQuote = await jupiterClient.getQuote({
			inputMint,
			outputMint,
			amount: params.amount.val,
			slippageBps: params.slippageBps,
			swapMode: params.swapMode,
			onlyDirectRoutes: params.onlyDirectRoutes,
		});

		return jupiterQuote;
	}

	/**
	 * Executes a swap between two spot markets (placeholder for future implementation).
	 *
	 * This method will handle swapping between different spot markets through
	 * the Velocity protocol's swap functionality.
	 *
	 * @param params - The swap parameters
	 * @returns Promise resolving to the transaction signature
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.executeSwap({
	 *   fromMarketIndex: 0, // USDT
	 *   toMarketIndex: 1,   // SOL
	 *   amount: new BigNum(100),
	 *   subAccountId: 0,
	 *   minReceiveAmount: new BigNum(0.5)
	 * });
	 * ```
	 */
	async swap(params: SwapParams): Promise<TransactionSignature> {
		const accountData = this.getUserAccountCache().getUser(
			params.subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!accountData) {
			throw new Error('User not found');
		}

		const auth =
			params.swapClientType?.type === 'titan'
				? {
						authToken: params.swapClientType.authToken,
						url: params.swapClientType.url,
				  }
				: undefined;

		const swapClient = new UnifiedSwapClient({
			clientType: params.swapClientType?.type ?? 'jupiter',
			connection: this.velocityClient.connection,
			...auth,
		});

		const swapQuote = params.quote
			? params.quote
			: await this.getSwapQuote(params);

		const swapTxn = await createSwapTxn({
			velocityClient: this.velocityClient,
			swapClient,
			user: accountData.userClient,
			swapFromMarketIndex: params.fromMarketIndex,
			swapToMarketIndex: params.toMarketIndex,
			amount: params.amount.val,
			quote: swapQuote,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(swapTxn);

		return txSig;
	}

	/**
	 * Settles P&L and funding for all perp position.
	 *
	 * @example
	 * ```typescript
	 * const txSig = await tradingOps.settlePnl({
	 *   subAccountId: 0,
	 *   marketIndex: 0, // SOL-PERP
	 *   counterpartySubAccountId: 1
	 * });
	 * ```
	 */
	async settleAccountPnl(
		params: SettleAccountPnlParams
	): Promise<TransactionSignature> {
		const { subAccountId } = params;

		const accountData = this.getUserAccountCache().getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!accountData) {
			throw new Error('User not found');
		}

		const marketIndexes = accountData.openPerpPositions.map(
			(position) => position.marketIndex
		);

		const settlePnlTxn = await createSettlePnlTxn({
			velocityClient: this.velocityClient,
			user: accountData.userClient,
			marketIndexes,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(settlePnlTxn);

		return txSig;
	}

	async cancelOrders(
		params: CancelOrdersParams
	): Promise<TransactionSignature> {
		const { subAccountId, orderIds } = params;

		const accountData = this.getUserAccountCache().getUser(
			subAccountId,
			this.velocityClient.wallet.publicKey
		);

		if (!accountData) {
			throw new Error('User not found');
		}

		const cancelOrdersTxn = await createCancelOrdersTxn({
			velocityClient: this.velocityClient,
			user: accountData.userClient,
			orderIds,
			txParams: this.getTxParams(),
		});

		const { txSig } = await this.velocityClient.sendTransaction(
			cancelOrdersTxn
		);

		return txSig;
	}
}

import {
	CustomizedCadenceBulkAccountLoader,
	DelistedMarketSetting,
	VELOCITY_PROGRAM_ID,
	VelocityClient,
	VelocityClientConfig,
	VelocityEnv,
	getMarketsAndOraclesForSubscription,
	IWallet,
	MarketType,
	PerpMarketConfig,
	PerpMarkets,
	QuoteResponse,
	SpotMarketConfig,
	SpotMarkets,
	SwapMode,
	User,
	WhileValidTxSender,
	IWalletV2,
	TxParams,
} from '@velocity-exchange/sdk';
import { Connection, PublicKey, TransactionSignature } from '@solana/web3.js';
import { createPlaceholderIWallet } from '../../../../utils/accounts/wallet';
import {
	DEFAULT_ACCOUNT_LOADER_COMMITMENT,
	DEFAULT_ACCOUNT_LOADER_POLLING_FREQUENCY_MS,
	DEFAULT_TX_SENDER_CONFIRMATION_STRATEGY,
	DEFAULT_TX_SENDER_RETRY_INTERVAL,
	DELISTED_MARKET_STATUSES,
	HIGH_ACTIVITY_MARKET_ACCOUNTS,
	PollingCategory,
} from '../../constants';
import { MarketId } from '../../../../types';
import { getMarketConfig } from '../../../../utils/markets/config';
import {
	POLLING_DEPTHS,
	POLLING_INTERVALS,
	PollingDlob,
} from '../../data/PollingDlob';
import { EnvironmentConstants } from '../../../../EnvironmentConstants';
import { logger } from '../../../../utils/logger';
import { MarkPriceLookup, MarkPriceCache } from '../../stores/MarkPriceCache';
import {
	OraclePriceLookup,
	OraclePriceCache,
} from '../../stores/OraclePriceCache';
import { VelocityL2OrderbookManager } from './VelocityL2OrderbookManager';
import { Subscription } from 'rxjs';
import {
	EnhancedAccountData,
	UserAccountCache,
	UserAccountLookup,
} from '../../stores/UserAccountCache';
import { ENUM_UTILS } from '../../../../utils';
import { checkGeoBlock } from '../../../../utils/geoblock';
import {
	PriorityFeeSubscriber,
	PriorityFeeSubscriberConfig,
	PriorityFeeMethod,
} from '@velocity-exchange/sdk';
import { SubscriptionManager } from './SubscriptionManager';
import { VelocityOperations } from './VelocityOperations';
import {
	CreateUserAndDepositParams,
	DepositParams,
	WithdrawParams,
	PerpOrderParams,
	SwapParams,
	SettleAccountPnlParams,
	CancelOrdersParams,
	CreateRevenueShareEscrowParams,
} from './VelocityOperations/types';
import { Initialize } from '../../../../Config';
import { L2WithOracleAndMarketData } from '../../../../utils/orderbook/types';
import { GeoBlockError } from '../../constants/errors';
import {
	DEFAULT_ORDERBOOK_GROUPING,
	DEFAULT_ORDERBOOK_SUBSCRIPTION_CONFIG,
} from '../../constants/orderbook';
import { OrderbookGrouping } from '../../../../utils/dlob-server/DlobServerWebsocketUtils';

/**
 * Decorator that prevents method execution if the user is geographically blocked.
 * Throws a GeoBlockError if the user is blocked.
 *
 * @param target - The class prototype
 * @param propertyName - The method name
 * @param descriptor - The method descriptor
 */
function enforceGeoBlock(
	_target: any,
	propertyName: string,
	descriptor: PropertyDescriptor
): PropertyDescriptor {
	const originalMethod = descriptor.value;

	descriptor.value = function (this: AuthorityVelocity, ...args: any[]) {
		if (this._isGeoBlocked) {
			throw new GeoBlockError(propertyName);
		}
		return originalMethod.apply(this, args);
	};

	return descriptor;
}

export interface AuthorityVelocityConfig {
	solanaRpcEndpoint: string;
	velocityEnv: VelocityEnv;
	wallet?: IWalletV2;
	velocityDlobServerHttpUrl?: string;
	tradableMarkets?: MarketId[];
	selectedTradeMarket?: MarketId;
	additionalVelocityClientConfig?: Partial<Omit<VelocityClientConfig, 'env'>>;
	priorityFeeSubscriberConfig?: Partial<PriorityFeeSubscriberConfig>;
	orderbookConfig?: {
		dlobWebSocketUrl?: string;
		orderbookGrouping?: OrderbookGrouping;
	};
}

/**
 * A Velocity client that is used to subscribe to all accounts for a given authority.
 *
 * This is useful for applications that want to subscribe to all user accounts for a given authority,
 * such as a UI to trade on Velocity or a wallet application that allows trading on Velocity.
 */
export class AuthorityVelocity {
	/**
	 * Handles all Velocity program interactions e.g. trading, read account details, etc.
	 */
	private _velocityClient!: VelocityClient;

	/**
	 * Handles bulk account loading from the RPC.
	 */
	private accountLoader!: CustomizedCadenceBulkAccountLoader;

	/**
	 * Handles polling the DLOB server for mark price and oracle price data for markets.
	 * It is also the fallback source for orderbook data, if the websocket DLOB subscriber is unavailable.
	 */
	private _pollingDlob!: PollingDlob;

	/**
	 * Subscription to the polling DLOB data.
	 */
	private pollingDlobSubscription: Subscription | null = null;

	/**
	 * Subscription to the orderbook data.
	 */
	private orderbookSubscription: Subscription | null = null;

	/**
	 * Handles all trading operations including deposits, withdrawals, and position management.
	 */
	private velocityOperations!: VelocityOperations;

	/**
	 * Manages all subscription operations including user accounts, market subscriptions, and polling optimization.
	 */
	private subscriptionManager!: SubscriptionManager;

	/**
	 * Stores the fetched mark prices for all tradable markets.
	 * Mark price sources includes:
	 * - Websocket DLOB subscriber (active market, derived when fetching orderbook data)
	 * - Polling DLOB server (all non-active markets)
	 */
	private _markPriceCache!: MarkPriceCache;

	/**
	 * Stores the fetched oracle prices for all tradable markets.
	 * Oracle price sources includes:
	 * - VelocityClient oracle account subscriptions
	 * - Polling DLOB server (all non-active markets)
	 */
	private _oraclePriceCache!: OraclePriceCache;

	/**
	 * Stores the fetched user account data for all user accounts.
	 */
	private _userAccountCache!: UserAccountCache;

	/**
	 * Manages real-time orderbook subscriptions via websocket.
	 */
	private _orderbookManager!: VelocityL2OrderbookManager;

	/**
	 * Handles priority fee tracking and calculation for optimized transaction costs.
	 */
	private priorityFeeSubscriber!: PriorityFeeSubscriber;

	/**
	 * Stores whether the user is geographically blocked from using the service.
	 * This is checked during subscription and cached for decorator use.
	 */
	protected _isGeoBlocked: boolean = false;

	/**
	 * The selected trade market to use for the velocity client. This is used to subscribe to the market account,
	 * oracle data and mark price more frequently compared to the other markets.
	 *
	 * Example usage:
	 * - When the UI wants to display the orderbook of this market.
	 * - When the user is interacting with the trade form to trade on this market.
	 */
	private selectedTradeMarket: MarketId | null = null;

	/**
	 * The markets that are tradable through this client. This affects oracle price, mark price and market account subscriptions.
	 */
	private _tradableMarkets: MarketId[] = [];

	private _spotMarketConfigs: SpotMarketConfig[] = [];
	private _perpMarketConfigs: PerpMarketConfig[] = [];

	/**
	 * The public endpoints that can be used to retrieve Velocity data / interact with the Velocity program.
	 */
	private _velocityEndpoints: {
		dlobServerHttpUrl: string;
		swiftServerUrl: string;
		orderbookWebsocketUrl: string;
	};

	/**
	 * @param solanaRpcEndpoint - The Solana RPC endpoint to use for reading RPC data.
	 * @param velocityEnv - The Velocity environment to use for the Velocity client.
	 * @param authority - The authority (wallet) whose user accounts to subscribe to.
	 * @param tradableMarkets - The markets that are tradable through this client.
	 * @param selectedTradeMarket - The active trade market to use for the velocity client. This is used to subscribe to the market account, oracle data and mark price more frequently compared to the other markets.
	 * @param additionalVelocityClientConfig - Additional VelocityClient config to use for the VelocityClient.
	 */
	constructor(config: AuthorityVelocityConfig) {
		// set up tradable markets
		this.selectedTradeMarket = config.selectedTradeMarket ?? null;

		const perpTradableMarkets = PerpMarkets[config.velocityEnv].map(
			(marketConfig) => MarketId.createPerpMarket(marketConfig.marketIndex)
		);
		const spotTradableMarkets = SpotMarkets[config.velocityEnv].map(
			(marketConfig) => MarketId.createSpotMarket(marketConfig.marketIndex)
		);

		this._tradableMarkets = config.tradableMarkets ?? [
			...perpTradableMarkets,
			...spotTradableMarkets,
		];
		this._spotMarketConfigs = spotTradableMarkets.map((market) =>
			getMarketConfig(config.velocityEnv, MarketType.SPOT, market.marketIndex)
		);
		this._perpMarketConfigs = perpTradableMarkets.map((market) =>
			getMarketConfig(config.velocityEnv, MarketType.PERP, market.marketIndex)
		);

		// set up Velocity endpoints
		const velocityDlobServerHttpUrlToUse =
			config.velocityDlobServerHttpUrl ??
			EnvironmentConstants.dlobServerHttpUrl[
				config.velocityEnv === 'devnet' ? 'dev' : 'mainnet'
			];
		const swiftServerUrlToUse =
			EnvironmentConstants.swiftServerUrl[
				config.velocityEnv === 'devnet' ? 'dev' : 'mainnet'
			];
		const orderbookWebsocketUrlToUse =
			config.orderbookConfig?.dlobWebSocketUrl ??
			EnvironmentConstants.dlobServerWsUrl[
				config.velocityEnv === 'devnet' ? 'dev' : 'mainnet'
			];
		this._velocityEndpoints = {
			dlobServerHttpUrl: velocityDlobServerHttpUrlToUse,
			swiftServerUrl: swiftServerUrlToUse,
			orderbookWebsocketUrl: orderbookWebsocketUrlToUse,
		};

		// we set this up because SerializableTypes
		Initialize(config.velocityEnv);

		// set up clients and stores
		const velocityClient = this.setupVelocityClient(config);
		this.initializePollingDlob(velocityDlobServerHttpUrlToUse);
		this.initializeStores(velocityClient);
		this.initializeOrderbookManager(
			orderbookWebsocketUrlToUse,
			config.orderbookConfig?.orderbookGrouping
		);
		this.initializePriorityFeeSubscriber(config.priorityFeeSubscriberConfig);
		this.initializeManagers(
			velocityDlobServerHttpUrlToUse,
			swiftServerUrlToUse
		);
	}

	public get velocityClient(): VelocityClient {
		return this._velocityClient;
	}

	public get authority(): PublicKey {
		return this._velocityClient.wallet.publicKey;
	}

	public get pollingDlob(): PollingDlob {
		return this._pollingDlob;
	}

	public get oraclePriceCache(): OraclePriceLookup {
		return this._oraclePriceCache.store;
	}

	public get markPriceCache(): MarkPriceLookup {
		return this._markPriceCache.store;
	}

	public get userAccountCache(): UserAccountLookup {
		return this._userAccountCache.store;
	}

	public get orderbookCache(): L2WithOracleAndMarketData | null {
		return this._orderbookManager.store;
	}

	public get orderbookManager(): VelocityL2OrderbookManager {
		return this._orderbookManager;
	}

	public get tradableMarkets(): MarketId[] {
		return this._tradableMarkets;
	}

	/**
	 * Gets the current geoblock status of the user.
	 *
	 * @returns True if the user is geographically blocked, false otherwise
	 */
	public get isGeoBlocked(): boolean {
		return this._isGeoBlocked;
	}

	/**
	 * The public endpoints that can be used to retrieve Velocity data / interact with the Velocity program.
	 */
	public get velocityEndpoints(): {
		dlobServerHttpUrl: string;
		swiftServerUrl: string;
	} {
		return this._velocityEndpoints;
	}

	private set tradableMarkets(tradableMarkets: MarketId[]) {
		this._tradableMarkets = tradableMarkets;
		this._spotMarketConfigs = tradableMarkets
			.filter((market) => !market.isPerp)
			.map((market) =>
				getMarketConfig(
					this._velocityClient.env,
					MarketType.SPOT,
					market.marketIndex
				)
			);
		this._perpMarketConfigs = tradableMarkets
			.filter((market) => market.isPerp)
			.map((market) =>
				getMarketConfig(
					this._velocityClient.env,
					MarketType.PERP,
					market.marketIndex
				)
			);
	}

	public get spotMarketConfigs(): SpotMarketConfig[] {
		return this._spotMarketConfigs;
	}

	public get perpMarketConfigs(): PerpMarketConfig[] {
		return this._perpMarketConfigs;
	}

	private initializeStores(velocityClient: VelocityClient) {
		this._markPriceCache = new MarkPriceCache();
		this._oraclePriceCache = new OraclePriceCache();
		this._userAccountCache = new UserAccountCache(
			velocityClient,
			this._oraclePriceCache,
			this._markPriceCache
		);
	}

	private initializeOrderbookManager(
		orderbookWebsocketUrl: string,
		orderbookGrouping: OrderbookGrouping = DEFAULT_ORDERBOOK_GROUPING
	) {
		this._orderbookManager = new VelocityL2OrderbookManager({
			wsUrl: orderbookWebsocketUrl,
			subscriptionConfig: this.selectedTradeMarket
				? {
						...DEFAULT_ORDERBOOK_SUBSCRIPTION_CONFIG,
						grouping: orderbookGrouping,
						marketId: this.selectedTradeMarket,
				  }
				: undefined,
		});
	}

	private initializePollingDlob(velocityDlobServerHttpUrl: string) {
		this._pollingDlob = new PollingDlob({
			velocityDlobServerHttpUrl: velocityDlobServerHttpUrl,
		});
	}

	private initializePriorityFeeSubscriber(
		config?: Partial<PriorityFeeSubscriberConfig>
	) {
		// Convert tradable markets to VelocityMarketInfo format for priority fee subscriber
		const velocityMarkets = this._tradableMarkets.map((market) => ({
			marketType: market.marketTypeStr,
			marketIndex: market.marketIndex,
		}));

		const priorityFeeConfig: PriorityFeeSubscriberConfig = {
			connection: this.velocityClient.connection,
			priorityFeeMethod: PriorityFeeMethod.SOLANA,
			velocityMarkets,
			addresses: HIGH_ACTIVITY_MARKET_ACCOUNTS,
			...config,
		};

		this.priorityFeeSubscriber = new PriorityFeeSubscriber(priorityFeeConfig);
	}

	private setupVelocityClient(
		config: Omit<AuthorityVelocityConfig, 'onUserAccountUpdate'>
	) {
		const velocityEnv = config.velocityEnv;

		const connection = new Connection(config.solanaRpcEndpoint);
		const velocityProgramID = new PublicKey(VELOCITY_PROGRAM_ID);
		const accountLoader = new CustomizedCadenceBulkAccountLoader(
			connection,
			DEFAULT_ACCOUNT_LOADER_COMMITMENT,
			DEFAULT_ACCOUNT_LOADER_POLLING_FREQUENCY_MS
		);
		this.accountLoader = accountLoader;

		const wallet = config.wallet ?? createPlaceholderIWallet();
		const skipInitialUsersLoad = !config.wallet;

		const perpMarkets =
			config.tradableMarkets
				?.filter((market) => market.isPerp)
				.map((market) =>
					getMarketConfig(velocityEnv, MarketType.PERP, market.marketIndex)
				) ?? PerpMarkets[velocityEnv];
		const spotMarkets =
			config.tradableMarkets
				?.filter((market) => !market.isPerp)
				.map((market) =>
					getMarketConfig(velocityEnv, MarketType.SPOT, market.marketIndex)
				) ?? SpotMarkets[velocityEnv];
		const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
			getMarketsAndOraclesForSubscription(
				velocityEnv,
				perpMarkets,
				spotMarkets
			);

		const velocityClientConfig: VelocityClientConfig = {
			env: velocityEnv,
			connection,
			wallet,
			programID: velocityProgramID,
			enableMetricsEvents: false,
			accountSubscription: {
				type: 'polling',
				accountLoader,
			},
			userStats: true,
			includeDelegates: true,
			skipLoadUsers: skipInitialUsersLoad,
			delistedMarketSetting: DelistedMarketSetting.Unsubscribe,
			perpMarketIndexes,
			spotMarketIndexes,
			oracleInfos,
			...config.additionalVelocityClientConfig,
		};
		this._velocityClient = new VelocityClient(velocityClientConfig);

		const txSender = new WhileValidTxSender({
			connection,
			wallet,
			additionalConnections: [],
			additionalTxSenderCallbacks: [],
			txHandler: this._velocityClient.txHandler,
			confirmationStrategy: DEFAULT_TX_SENDER_CONFIRMATION_STRATEGY,
			retrySleep: DEFAULT_TX_SENDER_RETRY_INTERVAL,
		});

		this._velocityClient.txSender = txSender;

		return this._velocityClient;
	}

	private setupOrderbookManager() {
		this.orderbookSubscription = this._orderbookManager.onUpdate(
			(orderbookData) => {
				const marketKey = new MarketId(
					orderbookData.marketIndex,
					ENUM_UTILS.toObj(orderbookData.marketType as string) as MarketType
				).key;

				const markPrice = orderbookData.markPrice;

				this._markPriceCache.updateMarkPrices({
					marketKey,
					markPrice,
					bestAsk: orderbookData.bestAskPrice,
					bestBid: orderbookData.bestBidPrice,
					lastUpdateSlot: orderbookData.slot ?? 0,
				});

				this._oraclePriceCache.updateOraclePrices({
					...orderbookData.oracleData,
					marketKey,
				});
			}
		);
	}

	private setupPollingDlob() {
		// VelocityL2OrderbookManager will handle the fetching of data for the selected trade market through websocket

		this._pollingDlob.addInterval(
			PollingCategory.USER_INVOLVED,
			POLLING_INTERVALS.BACKGROUND_DEEP,
			POLLING_DEPTHS.DEEP
		); // markets that the user is involved in
		this._pollingDlob.addInterval(
			PollingCategory.USER_NOT_INVOLVED,
			POLLING_INTERVALS.BACKGROUND_SHALLOW,
			POLLING_DEPTHS.SHALLOW
		); // markets that the user is not involved in

		// add all markets to the user-not-involved interval first, until user-involved markets are known
		this._pollingDlob.addMarketsToInterval(
			PollingCategory.USER_NOT_INVOLVED,
			this._tradableMarkets.map((market) => market.key)
		);

		this.pollingDlobSubscription = this._pollingDlob
			.onData()
			.subscribe((data) => {
				const updatedMarkPrices = data.map((marketData) => {
					return {
						marketKey: marketData.marketId.key,
						markPrice: marketData.data.markPrice,
						bestBid: marketData.data.bestBidPrice,
						bestAsk: marketData.data.bestAskPrice,
						lastUpdateSlot: marketData.data.slot ?? 0,
					};
				});
				const updatedOraclePrices = data.map((marketData) => {
					return {
						marketKey: marketData.marketId.key,
						...marketData.data.oracleData,
					};
				});

				this._markPriceCache.updateMarkPrices(...updatedMarkPrices);
				this._oraclePriceCache.updateOraclePrices(...updatedOraclePrices);
			});
	}

	private initializeManagers(
		dlobServerHttpUrl: string,
		swiftServerUrl: string
	) {
		// Initialize trading operations
		this.velocityOperations = new VelocityOperations(
			this._velocityClient,
			() => this._userAccountCache,
			dlobServerHttpUrl,
			swiftServerUrl,
			() => this.priorityFeeSubscriber.getCustomStrategyResult()
		);

		// Initialize subscription manager with all subscription and market operations
		this.subscriptionManager = new SubscriptionManager(
			this._velocityClient,
			this.accountLoader,
			this._pollingDlob,
			this._orderbookManager,
			this._userAccountCache,
			this._tradableMarkets,
			this.selectedTradeMarket
		);
	}

	private unsubscribeFromPollingDlob() {
		this.pollingDlobSubscription?.unsubscribe();
		this.pollingDlobSubscription = null;

		this._pollingDlob.stop();
	}

	private unsubscribeFromOrderbook() {
		this.orderbookSubscription?.unsubscribe();
		this.orderbookSubscription = null;

		this._orderbookManager.unsubscribe();
	}

	public async subscribe() {
		const handleGeoBlock = async () => {
			try {
				this._isGeoBlocked = (await checkGeoBlock()) ?? false;
			} catch (error) {
				logger.warn('Failed to check geoblock status:', error);
				this._isGeoBlocked = false; // Default to not blocked if check fails
			}
		};

		// async logic that doesn't require VelocityClient to be subscribed
		const handleGeoBlockPromise = handleGeoBlock();
		const pollingDlobStartPromise = this._pollingDlob.start();
		const priorityFeeSubscribePromise = this.priorityFeeSubscriber.subscribe();
		const orderbookSubscribePromise = this._orderbookManager.subscribe();

		await this._velocityClient.subscribe();

		// filter out markets that are delisted
		const actualTradableMarkets = this._tradableMarkets.filter((market) => {
			const marketAccount = market.isPerp
				? this._velocityClient.getPerpMarketAccount(market.marketIndex)
				: this._velocityClient.getSpotMarketAccount(market.marketIndex);

			if (
				!marketAccount ||
				DELISTED_MARKET_STATUSES.some((marketStatus) =>
					ENUM_UTILS.match(marketAccount.status, marketStatus)
				)
			) {
				return false;
			}

			return true;
		});

		this._tradableMarkets = actualTradableMarkets;
		this.subscriptionManager.updateTradableMarkets(actualTradableMarkets);
		this.setupPollingDlob();
		this.setupOrderbookManager();

		const subscribeToNonWhitelistedButUserInvolvedMarketsPromise =
			this.subscriptionManager.subscribeToNonWhitelistedButUserInvolvedMarkets(
				this._velocityClient.getUsers()
			);

		await Promise.all([
			pollingDlobStartPromise,
			subscribeToNonWhitelistedButUserInvolvedMarketsPromise,
			priorityFeeSubscribePromise,
			handleGeoBlockPromise,
			orderbookSubscribePromise,
		]);

		this.subscriptionManager.subscribeToAllUsersUpdates();
	}

	public async unsubscribe() {
		this.unsubscribeFromPollingDlob();
		this.unsubscribeFromOrderbook();
		this._userAccountCache.destroy();
		this._markPriceCache.destroy();
		this._orderbookManager.destroy();

		const velocityClientUnsubscribePromise = this._velocityClient.unsubscribe();
		const priorityFeeUnsubscribePromise =
			this.priorityFeeSubscriber.unsubscribe();

		await Promise.all(
			[velocityClientUnsubscribePromise, priorityFeeUnsubscribePromise].filter(
				Boolean
			)
		);

		this.pollingDlobSubscription = null;
	}

	public onOraclePricesUpdate(
		callback: (oraclePrice: OraclePriceLookup) => void
	) {
		return this._oraclePriceCache.onUpdate(callback);
	}

	public onMarkPricesUpdate(callback: (markPrice: MarkPriceLookup) => void) {
		return this._markPriceCache.onUpdate(callback);
	}

	public onUserAccountUpdate(
		callback: (userAccount: EnhancedAccountData) => void
	) {
		return this._userAccountCache.onUpdate(callback);
	}

	public onOrderbookUpdate(
		callback: (orderbook: L2WithOracleAndMarketData) => void
	) {
		return this._orderbookManager.onUpdate(callback);
	}

	/**
	 * Updates the authority (wallet) for the velocity client and reestablishes subscriptions.
	 *
	 * @param wallet - The new wallet to use as authority
	 * @param activeSubAccountId - Optional subaccount ID to switch to after wallet update
	 */
	public async updateAuthority(wallet: IWallet, activeSubAccountId?: number) {
		return this.subscriptionManager.updateAuthority(wallet, activeSubAccountId);
	}

	/**
	 * Updates the selected trade market and optimizes subscription polling.
	 *
	 * @param newSelectedTradeMarket - The new market to prioritize for trading
	 */
	public updateSelectedTradeMarket(newSelectedTradeMarket: MarketId | null) {
		const isNewSelectedTradeMarket =
			!!newSelectedTradeMarket !== !!this.selectedTradeMarket || // only one of them is null
			(!!newSelectedTradeMarket && // or both are not null and are different
				!!this.selectedTradeMarket &&
				!this.selectedTradeMarket.equals(newSelectedTradeMarket));

		if (!isNewSelectedTradeMarket) {
			return;
		}

		// Update the local reference
		this.selectedTradeMarket = newSelectedTradeMarket;

		// Delegate to subscription manager for all polling optimization
		this.subscriptionManager.updateSelectedTradeMarket(newSelectedTradeMarket);
	}

	/**
	 * Creates a new user account and deposits initial collateral.
	 *
	 * @param params - Parameters for creating user and depositing collateral
	 * @returns Promise resolving to transaction signature and user account public key
	 */
	public async createUserAndDeposit(
		params: CreateUserAndDepositParams
	): Promise<{
		txSig: TransactionSignature;
		user: User;
	}> {
		return this.velocityOperations.createUserAndDeposit(params);
	}

	/**
	 * Creates a RevenueShareEscrow account for the user.
	 *
	 * @param params - Parameters for creating a RevenueShareEscrow account
	 * @returns Promise resolving to the transaction signature of the creation
	 */
	public async createRevenueShareEscrow(
		params: CreateRevenueShareEscrowParams
	): Promise<TransactionSignature> {
		return this.velocityOperations.createRevenueShareEscrow(params);
	}

	/**
	 * Deposits collateral into a user's spot market position.
	 *
	 * @param params - Parameters for the deposit operation
	 * @returns Promise resolving to the transaction signature
	 */
	public async deposit(params: DepositParams): Promise<TransactionSignature> {
		return this.velocityOperations.deposit(params);
	}

	/**
	 * Withdraws collateral from a user's spot market position.
	 *
	 * @param params - Parameters for the withdrawal operation
	 * @returns Promise resolving to the transaction signature
	 */
	public async withdraw(params: WithdrawParams): Promise<TransactionSignature> {
		return this.velocityOperations.withdraw(params);
	}

	/**
	 * Opens a perpetual market order.
	 *
	 * @param params - Parameters for the perp order
	 * @returns Promise resolving to the transaction signature
	 */
	@enforceGeoBlock
	public async openPerpOrder(
		params: PerpOrderParams
	): Promise<TransactionSignature | void> {
		return this.velocityOperations.openPerpOrder(params);
	}

	/**
	 * Executes a swap between two spot markets.
	 *
	 * @param params - Parameters for the swap operation
	 * @returns Promise resolving to the transaction signature
	 */
	public async swap(params: SwapParams): Promise<TransactionSignature> {
		return this.velocityOperations.swap(params);
	}

	public async getSwapQuote(
		params: Omit<SwapParams, 'quote'> & {
			slippageBps?: number;
			swapMode?: SwapMode;
			onlyDirectRoutes?: boolean;
		}
	): Promise<QuoteResponse> {
		return this.velocityOperations.getSwapQuote(params);
	}

	/**
	 * Settles profit and loss for a perpetual position.
	 *
	 * @param params - Parameters for the settle PnL operation
	 * @returns Promise resolving to the transaction signature
	 */
	public async settleAccountPnl(
		params: SettleAccountPnlParams
	): Promise<TransactionSignature> {
		return this.velocityOperations.settleAccountPnl(params);
	}

	/**
	 * Deletes a user account from the Velocity protocol.
	 *
	 * @param subAccountId - The ID of the sub-account to delete
	 * @returns Promise resolving to the transaction signature of the deletion
	 */
	public async deleteUser(subAccountId: number): Promise<TransactionSignature> {
		return this.velocityOperations.deleteUser(subAccountId);
	}

	/**
	 * Cancels a list of open orders.
	 *
	 * @param params - See `CancelOrdersParams`
	 * @returns Promise resolving to the transaction signature of the cancellation
	 */
	public async cancelOrders(
		params: CancelOrdersParams
	): Promise<TransactionSignature> {
		return this.velocityOperations.cancelOrders(params);
	}

	public getTxParams(overrides?: Partial<TxParams>): TxParams {
		return this.velocityOperations.getTxParams(overrides);
	}
}

import {
	CustomizedCadenceBulkAccountLoader,
	VelocityClient,
	IWallet,
	PerpMarketAccount,
	PollingVelocityClientAccountSubscriber,
	SpotMarketAccount,
	User,
} from '@velocity-exchange/sdk';
import { MarketId, MarketKey } from '../../../../types';
import { PollingDlob } from '../../data/PollingDlob';
import {
	PollingCategory,
	SELECTED_MARKET_ACCOUNT_POLLING_CADENCE,
	USER_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE,
	USER_NOT_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE,
} from '../../constants';
import { UserAccountCache } from '../../stores/UserAccountCache';
import { VelocityL2OrderbookManager } from './VelocityL2OrderbookManager';
import { DEFAULT_ORDERBOOK_SUBSCRIPTION_CONFIG } from '../../constants/orderbook';

/**
 * Comprehensive subscription and market operations manager for the Velocity protocol.
 *
 * This class handles all aspects of subscription management including:
 * - User account subscriptions and event listeners
 * - Market account and oracle polling optimization
 * 	- Markets are categorized based on user involvement, and polling cadences are updated accordingly
 * - DLOB server polling configuration (for lesser used markets)
 * - DLOB server websocket subscription configuration (for selected trade market). Used to get orderbook data too.
 * - Authority (wallet) management with full resubscription
 *
 * By combining subscription and market operations, this provides a unified
 * interface for all subscription-related optimizations.
 */
export class SubscriptionManager {
	/**
	 * Creates a new SubscriptionManager instance.
	 *
	 * @param velocityClient - The VelocityClient instance for managing subscriptions
	 * @param accountLoader - Handles bulk account loading and polling frequency management
	 * @param pollingDlob - Manages DLOB server polling for market data
	 * @param userAccountCache - Cache for user account data updates
	 * @param tradableMarkets - Array of markets that are available for trading
	 * @param selectedTradeMarket - The market that is currently being traded
	 */
	constructor(
		private velocityClient: VelocityClient,
		private accountLoader: CustomizedCadenceBulkAccountLoader,
		private pollingDlob: PollingDlob,
		private orderbookManager: VelocityL2OrderbookManager,
		private userAccountCache: UserAccountCache,
		private tradableMarkets: MarketId[],
		private selectedTradeMarket: MarketId | null
	) {}

	/**
	 * Updates the tradable markets list.
	 *
	 * @param tradableMarkets - The new tradable markets list
	 */
	updateTradableMarkets(tradableMarkets: MarketId[]): void {
		this.tradableMarkets = tradableMarkets;
	}

	/**
	 * Subscribes to updates for all user accounts under the current authority.
	 *
	 * This method sets up event listeners for user account updates and ensures
	 * that market subscriptions are properly configured based on user positions.
	 * When a user's account data changes, it automatically triggers subscription
	 * updates to maintain optimal polling frequencies.
	 */
	subscribeToAllUsersUpdates(): void {
		const users = this.velocityClient.getUsers();

		this.handleSubscriptionUpdatesOnUserUpdates(users);

		users.forEach((user) => {
			this.userAccountCache.updateUserAccount(user); // initial hydration of user account data in the store

			user.eventEmitter.on('update', () => {
				this.handleSubscriptionUpdatesOnUserUpdates(users);
				this.userAccountCache.updateUserAccount(user);
			});
		});
	}

	/**
	 * Categorizes markets based on user involvement (active positions).
	 *
	 * Markets are classified as "user-involved" if any of the provided users
	 * have active positions (perp or spot) in those markets. This categorization
	 * is used to optimize polling frequencies - user-involved markets are polled
	 * more frequently to ensure accurate close to real-time data for user positions.
	 */
	categorizeMarketsByUserInvolvement(users: User[]): {
		userInvolvedMarkets: MarketId[];
		userNotInvolvedMarkets: MarketId[];
	} {
		const perpMarketIndexesSet = new Set<number>();
		const spotMarketIndexesSet = new Set<number>();
		users.forEach((user) => {
			const { activePerpPositions, activeSpotPositions } =
				user.getActivePositions();
			activePerpPositions.forEach((marketIndex) =>
				perpMarketIndexesSet.add(marketIndex)
			);
			activeSpotPositions.forEach((marketIndex) =>
				spotMarketIndexesSet.add(marketIndex)
			);
		});

		const userInvolvedMarkets = Array.from(perpMarketIndexesSet)
			.map((index) => MarketId.createPerpMarket(index))
			.concat(
				Array.from(spotMarketIndexesSet).map((index) =>
					MarketId.createSpotMarket(index)
				)
			);

		const userInvolvedMarketKeys = userInvolvedMarkets.map(
			(market) => market.key
		);
		const userNotInvolvedMarkets = this.tradableMarkets.filter(
			(market) => !userInvolvedMarketKeys.includes(market.key)
		);

		return { userInvolvedMarkets, userNotInvolvedMarkets };
	}

	/**
	 * Updates the polling cadence for a market account and its associated oracle account.
	 *
	 * This method optimizes data fetching by adjusting how frequently market and oracle
	 * accounts are polled from the RPC. Higher cadences (lower numbers) mean more frequent polling.
	 */
	updateMarketAccountCadence(market: MarketId, newCadence: number): void {
		const marketAccount = market.isPerp
			? this.velocityClient.getPerpMarketAccount(market.marketIndex)
			: this.velocityClient.getSpotMarketAccount(market.marketIndex);

		if (!marketAccount) {
			throw new Error(`Market account not found for market ${market.key}`);
		}

		const currentMarketCadence = this.accountLoader.getAccountCadence(
			marketAccount.pubkey
		);

		if (currentMarketCadence !== newCadence) {
			this.accountLoader.setCustomPollingFrequency(
				marketAccount.pubkey,
				newCadence
			);
		}

		const oracleAccountPubKey = market.isPerp
			? (marketAccount as PerpMarketAccount).oracle
			: (marketAccount as SpotMarketAccount).oracle;

		const currentOracleCadence =
			this.accountLoader.getAccountCadence(oracleAccountPubKey);

		if (currentOracleCadence !== newCadence) {
			this.accountLoader.setCustomPollingFrequency(
				oracleAccountPubKey,
				newCadence
			);
		}
	}

	/**
	 * Updates account loader polling cadences for multiple markets based on their categorization.
	 *
	 * This method applies different polling frequencies based on market importance:
	 * - Selected trade market: Highest frequency (most important for active trading)
	 * - User-involved markets: Medium frequency (user has positions)
	 * - User-not-involved markets: Lowest frequency (background monitoring)
	 */
	private updateAccountLoaderCadenceForMarkets(
		userInvolvedMarkets: MarketId[],
		userNotInvolvedMarkets: MarketId[],
		selectedTradeMarket?: MarketId | null
	): void {
		if (selectedTradeMarket) {
			this.updateMarketAccountCadence(
				selectedTradeMarket,
				SELECTED_MARKET_ACCOUNT_POLLING_CADENCE
			);
		}

		userInvolvedMarkets.forEach((market) => {
			this.updateMarketAccountCadence(
				market,
				USER_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE
			);
		});

		userNotInvolvedMarkets.forEach((market) => {
			this.updateMarketAccountCadence(
				market,
				USER_NOT_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE
			);
		});
	}

	/**
	 * Updates DLOB (Decentralized Limit Order Book) polling intervals for market data.
	 *
	 * This method configures how frequently the DLOB server is polled for market data
	 * including mark prices, oracle prices, and orderbook data. Different markets are
	 * assigned to different polling intervals based on their importance.
	 */
	private updatePollingDlobIntervals(
		userInvolvedMarkets: MarketKey[],
		userNotInvolvedMarkets: MarketKey[]
	): void {
		this.pollingDlob.addMarketsToInterval(
			PollingCategory.USER_INVOLVED,
			userInvolvedMarkets
		);
		this.pollingDlob.addMarketsToInterval(
			PollingCategory.USER_NOT_INVOLVED,
			userNotInvolvedMarkets
		);
	}

	/**
	 * Handles comprehensive subscription updates when user account data changes.
	 *
	 * This is the main orchestration method that ensures optimal polling frequencies
	 * are maintained when user positions change. It automatically:
	 *
	 * 1. Categorizes markets based on current user involvement
	 * 2. Updates account loader cadences for market and oracle accounts
	 * 3. Updates DLOB polling intervals for price data
	 *
	 * The method ensures that markets with user positions get higher priority polling
	 * to maintain accurate real-time data for position management.
	 */
	handleSubscriptionUpdatesOnUserUpdates(users: User[]): void {
		const { userInvolvedMarkets, userNotInvolvedMarkets } =
			this.categorizeMarketsByUserInvolvement(users);

		// Filter out selected trade market from the other categories
		const filteredUserInvolvedMarkets = userInvolvedMarkets.filter(
			(market) => market.key !== this.selectedTradeMarket?.key
		);
		const filteredUserNotInvolvedMarkets = userNotInvolvedMarkets.filter(
			(market) => market.key !== this.selectedTradeMarket?.key
		);

		// Update market account cadences
		this.updateAccountLoaderCadenceForMarkets(
			filteredUserInvolvedMarkets,
			filteredUserNotInvolvedMarkets,
			this.selectedTradeMarket
		);

		// Handle polling dlob polling intervals
		this.updatePollingDlobIntervals(
			filteredUserInvolvedMarkets.map((market) => market.key),
			filteredUserNotInvolvedMarkets.map((market) => market.key)
		);
	}

	/**
	 * Subscribes to markets that users are involved in but aren't in the default tradable markets list.
	 *
	 * This method ensures that if users have positions in markets that weren't initially
	 * included in the tradable markets list, those markets are still properly subscribed to.
	 * This is important for maintaining accurate account data even for edge cases.
	 */
	async subscribeToNonWhitelistedButUserInvolvedMarkets(
		users: User[]
	): Promise<void> {
		const perpMarketIndexesSet = new Set(
			(
				this.velocityClient
					.accountSubscriber as PollingVelocityClientAccountSubscriber
			).perpMarketIndexes
		);
		const spotMarketIndexesSet = new Set(
			(
				this.velocityClient
					.accountSubscriber as PollingVelocityClientAccountSubscriber
			).spotMarketIndexes
		);

		const { userInvolvedMarkets } =
			this.categorizeMarketsByUserInvolvement(users);

		userInvolvedMarkets.forEach((market) => {
			if (market.isPerp) {
				perpMarketIndexesSet.add(market.marketIndex);
			} else {
				spotMarketIndexesSet.add(market.marketIndex);
			}
		});

		(
			this.velocityClient
				.accountSubscriber as PollingVelocityClientAccountSubscriber
		).perpMarketIndexes = Array.from(perpMarketIndexesSet);
		(
			this.velocityClient
				.accountSubscriber as PollingVelocityClientAccountSubscriber
		).spotMarketIndexes = Array.from(spotMarketIndexesSet);

		// TODO: see if this can be optimized - instead of unsubscribing and resubscribing, find a way to add the new markets to the existing subscription
		await (
			this.velocityClient
				.accountSubscriber as PollingVelocityClientAccountSubscriber
		).unsubscribe();
		await (
			this.velocityClient
				.accountSubscriber as PollingVelocityClientAccountSubscriber
		).subscribe();
	}

	private checkIsUserInvolvedInMarket(marketId: MarketId): boolean {
		let isUserInvolvedInPreviousSelectedTradeMarket = false;
		const allUsers = this.userAccountCache.allUsers;
		for (const user of allUsers) {
			const { activePerpPositions, activeSpotPositions } =
				user.userClient.getActivePositions();

			if (
				marketId.isPerp &&
				activePerpPositions.includes(marketId.marketIndex)
			) {
				isUserInvolvedInPreviousSelectedTradeMarket = true;
				break;
			}
			if (
				marketId.isSpot &&
				activeSpotPositions.includes(marketId.marketIndex)
			) {
				isUserInvolvedInPreviousSelectedTradeMarket = true;
				break;
			}
		}

		return isUserInvolvedInPreviousSelectedTradeMarket;
	}

	/**
	 * Updates the selected trade market and optimizes all subscription polling accordingly.
	 *
	 * This method handles:
	 * 1. Removing the previous market from high-frequency polling
	 * 2. Adding the new market to high-frequency polling
	 * 3. Updating market account cadences for optimal performance
	 * 4. Categorizing the previous market based on user involvement
	 * 5. Assigning appropriate polling intervals to the previous market
	 *
	 * @param newSelectedTradeMarket - The new market to prioritize for trading
	 */
	updateSelectedTradeMarket(newSelectedTradeMarket: MarketId | null): void {
		const previousSelectedTradeMarket = this.selectedTradeMarket;

		this.orderbookManager.unsubscribe();

		if (previousSelectedTradeMarket) {
			const isUserInvolvedInPreviousSelectedTradeMarket =
				this.checkIsUserInvolvedInMarket(previousSelectedTradeMarket);

			const pollingCategoryOfPreviousSelectedMarket =
				isUserInvolvedInPreviousSelectedTradeMarket
					? PollingCategory.USER_INVOLVED
					: PollingCategory.USER_NOT_INVOLVED;
			this.pollingDlob.addMarketToInterval(
				pollingCategoryOfPreviousSelectedMarket,
				previousSelectedTradeMarket.key
			);

			const pollingCadenceOfPreviousSelectedMarket =
				isUserInvolvedInPreviousSelectedTradeMarket
					? USER_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE
					: USER_NOT_INVOLVED_MARKET_ACCOUNT_POLLING_CADENCE;
			this.updateMarketAccountCadence(
				previousSelectedTradeMarket,
				pollingCadenceOfPreviousSelectedMarket
			);
		}

		// Update the selected trade market
		this.selectedTradeMarket = newSelectedTradeMarket;

		if (newSelectedTradeMarket) {
			const isUserInvolvedInNewSelectedTradeMarket =
				this.checkIsUserInvolvedInMarket(newSelectedTradeMarket);

			const pollingCategoryOfNewsSelectedMarket =
				isUserInvolvedInNewSelectedTradeMarket
					? PollingCategory.USER_INVOLVED
					: PollingCategory.USER_NOT_INVOLVED;
			this.pollingDlob.removeMarketFromInterval(
				pollingCategoryOfNewsSelectedMarket,
				newSelectedTradeMarket.key
			);

			this.updateMarketAccountCadence(
				newSelectedTradeMarket,
				SELECTED_MARKET_ACCOUNT_POLLING_CADENCE
			);

			this.orderbookManager.updateSubscription({
				...DEFAULT_ORDERBOOK_SUBSCRIPTION_CONFIG,
				marketId: newSelectedTradeMarket,
			});
		}
	}

	/**
	 * Updates the authority (wallet) for the velocity client and reestablishes subscriptions.
	 *
	 * This method handles the complete process of switching to a new wallet:
	 * 1. Checks if the wallet is actually different
	 * 2. Unsubscribes from current user accounts
	 * 3. Resets the user account cache
	 * 4. Updates the VelocityClient with the new wallet
	 * 5. Resubscribes to markets based on new user positions
	 * 6. Switches to the specified subaccount if provided
	 * 7. Reestablishes user account subscriptions
	 */
	async updateAuthority(
		wallet: IWallet,
		activeSubAccountId?: number
	): Promise<void> {
		if (this.velocityClient.wallet.publicKey.equals(wallet.publicKey)) {
			return;
		}

		await Promise.all(this.velocityClient.unsubscribeUsers());
		this.userAccountCache.reset();

		const updateWalletResult = await this.velocityClient.updateWallet(
			wallet,
			undefined,
			activeSubAccountId,
			true,
			undefined
		);

		await this.subscribeToNonWhitelistedButUserInvolvedMarkets(
			this.velocityClient.getUsers()
		);

		if (!updateWalletResult) {
			throw new Error('Failed to update wallet');
		}

		if (activeSubAccountId) {
			await this.velocityClient.switchActiveUser(activeSubAccountId);
		}

		this.subscribeToAllUsersUpdates();
	}
}

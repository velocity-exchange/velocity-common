import {
	CandleResolution,
	DevnetPerpMarkets,
	DevnetSpotMarkets,
	MainnetPerpMarkets,
	MainnetSpotMarkets,
} from '@velocity-exchange/sdk';
import { JsonCandle, MarketId, MarketSymbol } from '../types';
import { Candle } from '../utils/candles/Candle';
import { StrictEventEmitter } from '../utils/StrictEventEmitter';
import { EnvironmentConstants } from '../EnvironmentConstants';
import { UIEnv } from '../types/UIEnv';
import { assert } from '../utils/assert';
import { CandleSubscriberSubscription, MarketDataFeed } from './marketDataFeed';
import { logger } from '../utils/logger';

/**
 * # CANDLE CLIENT HIGH LEVEL EXPLANATION:
 * The Candle Client uses the Data API (see https://data.api.drift.trade/playground) to source candles to display.
 *
 * There are two key parts of the client:
 * - Fetching Candles
 * - Subscribing to Candles
 *
 * ## Fetching Candles:
 * - We can fetch candles between any timestamp range.
 * - The maximum number of candles we can fetch in a single request is 1000 (see CANDLE_FETCH_LIMIT).
 * - We define "recent history" to be the last 1000 candles .. basically whatever comes back from the infra when we don't use a startTs and use the maximum fetch limit.
 * - We want to avoid using high cardinality parameters in the fetch because otherwise we will miss the cache in the infra.
 * 	- A concrete example of this is that we don't attach a startTs parameter when we are fetching candles within recent history (past 1000 candles)
 * - We cache the recent candles in memory so that any subsequent fetches within recent history after the first one will be served from cache.
 * 	- e.g. moving back to a further timeframe on TradingView - the required candles could potentially be in the cache, so we don't need to refetch them.
 *
 * ## Subscribing to Candles:
 * - We subscribe to a websocket endpoint for a given market and resolution.
 * - We allow the client to support multiple concurrent subscriptions, because the TradingView comopnent will sometimes do this when switching between markets.
 *
 * ## Possible Improvements:
 * - Create a more advanced cache which can store more than the most recent 1000 candles, dynamically growing as more candles are added (for now seems unnecessary, rare for someone to go back further than 1000 candles)
 */

/**
 * Optional configuration for the CandleClient.
 */
export type CandleClientConfig = {
	/**
	 * Optional override for the base data API URL used when fetching candles over HTTP
	 * (e.g. `https://data.velocity.exchange` or a same-origin path like `/api/data-proxy/dev`).
	 *
	 * When omitted, the URL is derived from EnvironmentConstants using the `env` passed to
	 * each fetch. Useful in local dev to route candle requests through a same-origin proxy
	 * to avoid CORS restrictions.
	 *
	 * Note: this only affects the HTTP candle fetch endpoint. Websocket candle
	 * subscriptions are handled separately via the MarketDataFeed.
	 */
	dataApiUrl?: string;
};

// Used by the subscriber client to fetch candles from the data API
type CandleFetchConfig = {
	env: UIEnv;
	marketId: MarketId;
	resolution: CandleResolution;
	fromTs: number; // Seconds
	toTs: number; // Seconds
	dataApiUrl?: string; // Optional base data API URL override
};

// Used by the subscriber client to subscribe to the candles websocket endpoint
type CandleSubscriptionConfig = {
	resolution: CandleResolution;
	marketId: MarketId;
	env: UIEnv;
};

// This is what the client subscriber uses internally to fetch the candles from the data API
type CandleFetchUrlConfig = {
	env: UIEnv;
	marketId: MarketId;
	resolution: CandleResolution;
	startTs?: number; // Seconds - now optional
	countToFetch: number;
	dataApiUrl?: string; // Optional base data API URL override
};

type CandleFetchResponseJson = {
	success: boolean;
	records: JsonCandle[];
};

const getMarketSymbolForMarketId = (marketId: MarketId, uiEnv: UIEnv) => {
	const isPerp = marketId.isPerp;

	const sdkEnv = uiEnv.sdkEnv;

	if (isPerp) {
		const marketConfigs =
			sdkEnv === 'mainnet-beta' ? MainnetPerpMarkets : DevnetPerpMarkets;
		const targetMarketConfig = marketConfigs.find(
			(config) => config.marketIndex === marketId.marketIndex
		);
		if (!targetMarketConfig) {
			throw new Error(
				`No market config found for market index ${marketId.marketIndex}`
			);
		}
		return targetMarketConfig.symbol as MarketSymbol;
	} else {
		const marketConfigs =
			sdkEnv === 'mainnet-beta' ? MainnetSpotMarkets : DevnetSpotMarkets;
		const targetMarketConfig = marketConfigs.find(
			(config) => config.marketIndex === marketId.marketIndex
		);
		if (!targetMarketConfig) {
			throw new Error(
				`No market config found for market index ${marketId.marketIndex}`
			);
		}
		return targetMarketConfig.symbol as MarketSymbol;
	}
};

// This is the maximum number of candles that can be fetched in a single GET request
const CANDLE_FETCH_LIMIT = 1000;

const getBaseDataApiUrl = (env: UIEnv, dataApiUrlOverride?: string) => {
	if (dataApiUrlOverride) {
		// Strip any trailing slash so the path can be appended safely.
		return dataApiUrlOverride.replace(/\/$/, '');
	}

	const constantEnv: keyof typeof EnvironmentConstants.dataServerUrl =
		env.isStaging ? 'staging' : env.isDevnet ? 'dev' : 'mainnet';
	return EnvironmentConstants.dataServerUrl[constantEnv];
};

const getCandleFetchUrl = ({
	env,
	marketId,
	resolution,
	startTs,
	countToFetch,
	dataApiUrl,
}: CandleFetchUrlConfig) => {
	const baseDataApiUrl = getBaseDataApiUrl(env, dataApiUrl);

	let fetchUrl = `${baseDataApiUrl}/market/${getMarketSymbolForMarketId(
		marketId,
		env
	)}/candles/${resolution}?limit=${Math.min(countToFetch, CANDLE_FETCH_LIMIT)}`;

	if (startTs !== undefined) {
		fetchUrl += `&startTs=${startTs}`;
	}

	return fetchUrl;
};

type CandleSubscriberEvents = {
	'candle-update': JsonCandle;
};

class CandleEventBus extends StrictEventEmitter<CandleSubscriberEvents> {}

// This class is reponsible for fetching candles from the data API's GET endpoint
class CandleFetcher {
	private readonly config: CandleFetchConfig;

	// Cache for storing recent candles by market ID and resolution
	public static recentCandlesCache: Map<
		string, // key: `${marketId.key}-${resolution}`
		{
			candles: JsonCandle[];
			earliestTs: number;
			latestTs: number;
			fetchTime: number;
		}
	> = new Map();

	// Helper method to generate a cache key from market ID and resolution
	public static getCacheKey(
		marketId: MarketId,
		resolution: CandleResolution
	): string {
		return `${marketId.key}-${resolution}`;
	}

	// Public method to clear the entire cache
	public static clearWholeCache() {
		CandleFetcher.recentCandlesCache.clear();
	}

	public static clearCacheForSubscription(
		marketId: MarketId,
		resolution: CandleResolution
	) {
		CandleFetcher.recentCandlesCache.delete(
			CandleFetcher.getCacheKey(marketId, resolution)
		);
	}

	constructor(config: CandleFetchConfig) {
		this.config = config;
	}

	/**
	 * Candles are fetched in ascending order of time (index 0 -> oldest to index n -> newest)
	 */
	private fetchCandlesFromApi = async (
		fetchUrl: string
	): Promise<JsonCandle[]> => {
		const response = await fetch(fetchUrl);
		const parsedResponse = (await response.json()) as CandleFetchResponseJson;

		if (!parsedResponse.success) {
			throw new Error('Failed to fetch candles from data API');
		}

		return parsedResponse.records;
	};

	private getCountOfCandlesBetweenStartAndEndTs = (
		startTs: number,
		endTs: number
	) => {
		const diffInSeconds = endTs - startTs;
		const resolutionInSeconds =
			Candle.resolutionStringToCandleLengthMs(this.config.resolution) / 1000;
		const diffInCandles = diffInSeconds / resolutionInSeconds;
		return Math.ceil(diffInCandles);
	};

	/**
	 * Try to get candles from the cache if they're available.
	 * Returns null if no cached candles are available for the requested range.
	 */
	private getFromCache = (): JsonCandle[] | null => {
		// Generate cache key for the current request
		const cacheKey = CandleFetcher.getCacheKey(
			this.config.marketId,
			this.config.resolution
		);
		const cachedCandles = CandleFetcher.recentCandlesCache.get(cacheKey);

		// Check if we have cached candles for this market and resolution
		if (cachedCandles) {
			// Check if the requested time range is within the bounds of cached candles
			if (
				this.config.fromTs >= cachedCandles.earliestTs &&
				this.config.toTs <= cachedCandles.latestTs
			) {
				// Filter cached candles to the requested time range
				const filteredCandles = cachedCandles.candles.filter(
					(candle) =>
						candle.ts >= this.config.fromTs && candle.ts <= this.config.toTs
				);

				return filteredCandles;
			}
		}

		return null;
	};

	/**
	 * Determines if we should use the recent candles approach (without startTs for better caching).
	 */
	private isRequestingRecentCandles = (
		nowSeconds: number,
		candleLengthSeconds: number
	): boolean => {
		// Calculate cutoff time for "recent" candles (now - 1000 candles worth of time)
		const recentCandlesCutoffTs =
			nowSeconds - candleLengthSeconds * CANDLE_FETCH_LIMIT;

		// Check if we're fetching recent candles based on the fromTs
		return this.config.fromTs >= recentCandlesCutoffTs;
	};

	/**
	 * Fetch recent candles without using startTs for better caching.
	 */
	private fetchRecentCandles = async (
		nowSeconds: number
	): Promise<JsonCandle[]> => {
		// Fetch recent candles without specifying startTs
		const fetchUrl = getCandleFetchUrl({
			env: this.config.env,
			marketId: this.config.marketId,
			resolution: this.config.resolution,
			countToFetch: CANDLE_FETCH_LIMIT, // Ask for max candles to ensure we get enough
			dataApiUrl: this.config.dataApiUrl,
		});

		// Get the candles and reverse them (into ascending order)
		const fetchedCandles = await this.fetchCandlesFromApi(fetchUrl);
		fetchedCandles.reverse();

		if (fetchedCandles.length === 0) {
			return [];
		}

		// Store the full fetchedCandles in cache before filtering
		this.updateCandleCache(fetchedCandles, nowSeconds);

		// Filter to only include candles in the requested time range
		const filteredCandles = this.filterCandlesByTimeRange(fetchedCandles);

		return filteredCandles;
	};

	/**
	 * Filter candles to only include those in the requested time range.
	 */
	private filterCandlesByTimeRange = (candles: JsonCandle[]): JsonCandle[] => {
		return candles.filter(
			(candle) =>
				candle.ts >= this.config.fromTs && candle.ts <= this.config.toTs
		);
	};

	/**
	 * Update the candle cache with the latest fetched candles.
	 */
	private updateCandleCache = (
		fetchedCandles: JsonCandle[],
		nowSeconds: number
	): void => {
		if (fetchedCandles.length > 0) {
			// Generate cache key
			const cacheKey = CandleFetcher.getCacheKey(
				this.config.marketId,
				this.config.resolution
			);

			// Sort candles by timestamp to find earliest and latest
			const sortedCandles = [...fetchedCandles].sort((a, b) => a.ts - b.ts);
			const earliestTs = sortedCandles[0].ts;
			const latestTs = sortedCandles[sortedCandles.length - 1].ts;

			// Update or add to cache
			CandleFetcher.recentCandlesCache.set(cacheKey, {
				candles: sortedCandles,
				earliestTs,
				latestTs,
				fetchTime: nowSeconds,
			});
		}
	};

	/**
	 * Fetch historical candles with pagination using startTs.
	 */
	private fetchHistoricalCandles = async (): Promise<JsonCandle[]> => {
		let candlesRemainingToFetch = this.getCountOfCandlesBetweenStartAndEndTs(
			this.config.fromTs,
			this.config.toTs
		);

		let currentStartTs = this.config.toTs; // The data API takes "startTs" as the "first timestamp you want going backwards in time" e.g. all candles will be returned with descending time backwards from the startTs
		let hitEndTsCutoff = false;

		let candles: JsonCandle[] = [];

		while (candlesRemainingToFetch > 0) {
			const result = await this.fetchHistoricalCandlesBatch(
				candlesRemainingToFetch,
				currentStartTs
			);

			if (result.fetchedCandles.length === 0) {
				candlesRemainingToFetch = 0;
				break;
			}

			// the deeper the loop, the older the result.candlesToAdd will be
			candles = [...result.candlesToAdd, ...candles];
			candlesRemainingToFetch -= result.candlesToAdd.length;
			hitEndTsCutoff = result.hitEndTsCutoff;

			if (result.requiresAnotherFetch) {
				currentStartTs = result.nextStartTs;
			} else if (candlesRemainingToFetch > 0) {
				// This means we have fetched all the candles available for this time range and we can stop fetching
				candlesRemainingToFetch = 0;
			}
		}

		if (hitEndTsCutoff) {
			return this.filterCandlesByTimeRange(candles);
		}

		return candles;
	};

	/**
	 * Fetch historical candles with pagination, backwards from the toTs value given in the config.
	 *
	 * This method works by looping backwards from the LATEST (toTs) timestamp to the OLDEST (fromTs) timestamp.
	 *
	 * Things to note:
	 * - There is a limit to how many candles can be fetched in a single request (see CANDLE_FETCH_LIMIT)
	 * - We have implemented this to minimise the cardinality in the API request because that helps with caching
	 */
	private fetchHistoricalCandlesBatch = async (
		candlesRemainingToFetch: number,
		currentStartTs: number
	): Promise<{
		fetchedCandles: JsonCandle[];
		candlesToAdd: JsonCandle[];
		hitEndTsCutoff: boolean;
		requiresAnotherFetch: boolean;
		nextStartTs: number;
	}> => {
		const candlesToFetch = Math.min(
			candlesRemainingToFetch,
			CANDLE_FETCH_LIMIT
		);

		const fetchUrl = getCandleFetchUrl({
			env: this.config.env,
			marketId: this.config.marketId,
			resolution: this.config.resolution,
			startTs: currentStartTs, // Include startTs for historical candles
			countToFetch: candlesToFetch,
			dataApiUrl: this.config.dataApiUrl,
		});

		const fetchedCandles = await this.fetchCandlesFromApi(fetchUrl);

		// Reverse candles into ascending order
		fetchedCandles.reverse();

		if (fetchedCandles.length === 0) {
			return {
				fetchedCandles,
				candlesToAdd: [],
				hitEndTsCutoff: false,
				requiresAnotherFetch: false,
				nextStartTs: currentStartTs,
			};
		}

		const lastCandle = fetchedCandles[fetchedCandles.length - 1]; // This is the LATEST candle .. (they are sorted ascending by time right now)

		const hitPageSizeCutoff = fetchedCandles.length === CANDLE_FETCH_LIMIT;
		const hitEndTsCutoff = lastCandle.ts < this.config.fromTs;

		const requiresAnotherFetch = hitPageSizeCutoff && !hitEndTsCutoff; // If the number of candles returned is equal to the maximum number of candles that can be fetched in a single GET request, then we need to fetch more candles

		let candlesToAdd = fetchedCandles;
		let nextStartTs = currentStartTs;

		if (requiresAnotherFetch) {
			// If we need to do another fetch, trim any candles with the same timestamp as the last candle in the previous fetch, because that is the pointer for our next fetch and we don't want to duplicate candles
			candlesToAdd = candlesToAdd.filter((candle) => {
				return candle.ts < lastCandle.ts;
			});

			const oldestCandle = fetchedCandles[0]; // first candle is the oldest
			nextStartTs = oldestCandle.ts; // If we are doing another loop, then the trimmed candles have all the candles except for ones with the last candle's timestamp. For the next loop we want to fetch from that timestamp;
		}

		return {
			fetchedCandles,
			candlesToAdd,
			hitEndTsCutoff,
			requiresAnotherFetch,
			nextStartTs,
		};
	};

	/**
	 * This class needs to fetch candles based on the config.
	 *
	 * If the number of candles requested exceeds the maximum number of candles that can be fetched in a single GET request, then it needs to loop multiple get requests, using the last candle's timestamp as the offset startTs for each subsequent request. If the number of candles returned is less than the requested number of candles, then we have fetched all the candles available.
	 *
	 * For recent candles (ones where fromTs > now - candleLength*1000), we avoid using startTs in the URL to improve caching,
	 * and instead fetch the most recent 1000 candles and then trim the result.
	 */
	public fetchCandles = async () => {
		// Check cache first
		const cachedCandles = this.getFromCache();
		if (cachedCandles) {
			return cachedCandles;
		}

		// Calculate the candle length in seconds for the current resolution
		const candleLengthMs = Candle.resolutionStringToCandleLengthMs(
			this.config.resolution
		);
		const candleLengthSeconds = candleLengthMs / 1000;

		// Get current time in seconds
		const nowSeconds = Math.floor(Date.now() / 1000);

		// Check if we're fetching recent candles
		if (this.isRequestingRecentCandles(nowSeconds, candleLengthSeconds)) {
			return this.fetchRecentCandles(nowSeconds);
		}

		// For historical candles (older than the last 1000 candles), use the previous approach
		// with startTs for pagination
		return this.fetchHistoricalCandles();
	};
}

class CandleSubscriber {
	private subscription!: CandleSubscriberSubscription;

	constructor(
		readonly config: CandleSubscriptionConfig,
		readonly eventBus: CandleEventBus
	) {}

	subscribeToCandles = async () => {
		this.subscription = MarketDataFeed.subscribe({
			type: 'candles',
			resolution: this.config.resolution,
			env: this.config.env,
			marketSymbol: getMarketSymbolForMarketId(
				this.config.marketId,
				this.config.env
			),
		});

		this.subscription.observable.subscribe((candle) => {
			this.eventBus.emit('candle-update', candle);
		});
	};

	unsubscribe = () => {
		MarketDataFeed.unsubscribe(this.subscription.id);
	};
}

/**
 * This class will subscribe to candles from the Velocity Data API.
 *
 * Note: If you are using TradingView you probably want to just use the VelocityTvFeed class instead.
 */
export class CandleClient {
	private activeSubscriptions: Map<
		string,
		{
			subscriber: CandleSubscriber;
			eventBus: CandleEventBus;
		}
	> = new Map();

	private readonly dataApiUrl?: string;

	constructor(config?: CandleClientConfig) {
		this.dataApiUrl = config?.dataApiUrl;
	}

	public subscribe = async (
		config: CandleSubscriptionConfig,
		subscriptionKey: string
	) => {
		// Kill any existing subscription with the same key before creating a new one
		if (this.activeSubscriptions.has(subscriptionKey)) {
			this.unsubscribe(subscriptionKey);
		}

		const eventBus = new CandleEventBus();
		const subscriber = new CandleSubscriber(config, eventBus);
		await subscriber.subscribeToCandles();

		this.activeSubscriptions.set(subscriptionKey, {
			subscriber,
			eventBus,
		});

		return;
	};

	/**
	 *
	 * @param config {
	 *
	 *   env: UIEnv;
	 *
	 *   marketId: MarketId;
	 *
	 *   resolution: CandleResolution;
	 *
	 *   fromTs: number;      // Seconds :: This should be the START (oldest) timestamp of the candles to fetch
	 *
	 *   toTs: number;        // Seconds :: This should be the END (newest) timestamp of the candles to fetch
	 *
	 * }
	 * @returns
	 */
	public fetch = async (config: CandleFetchConfig): Promise<JsonCandle[]> => {
		assert(config.fromTs < config.toTs, 'fromTs must be less than toTs');
		const nowSeconds = Math.floor(Date.now() / 1000);
		assert(
			config.fromTs <= nowSeconds && config.toTs <= nowSeconds,
			`fromTs and toTs cannot be in the future (Requested fromTs: ${new Date(
				config.fromTs * 1000
			).toISOString()} and toTs: ${new Date(
				config.toTs * 1000
			).toISOString()}, Current time: ${new Date(
				nowSeconds * 1000
			).toISOString()})`
		);
		const candleFetcher = new CandleFetcher({
			...config,
			dataApiUrl: config.dataApiUrl ?? this.dataApiUrl,
		});
		const candles = await candleFetcher.fetchCandles();
		return candles;
	};

	public unsubscribe = (subscriptionKey: string) => {
		const subscription = this.activeSubscriptions.get(subscriptionKey);
		if (subscription) {
			CandleFetcher.clearCacheForSubscription(
				subscription.subscriber.config.marketId,
				subscription.subscriber.config.resolution
			);
			subscription.subscriber.unsubscribe();
			subscription.eventBus.removeAllListeners();
			this.activeSubscriptions.delete(subscriptionKey);
		}
	};

	public unsubscribeAll = () => {
		for (const subscriptionKey of this.activeSubscriptions.keys()) {
			this.unsubscribe(subscriptionKey);
		}
	};

	public on(
		subscriptionKey: string,
		event: keyof CandleSubscriberEvents,
		listener: (candle: JsonCandle) => void
	) {
		const subscription = this.activeSubscriptions.get(subscriptionKey);
		if (subscription) {
			subscription.eventBus.on(event, listener);
		} else {
			logger.warn(`No active subscription found for key: ${subscriptionKey}`);
		}
	}
}

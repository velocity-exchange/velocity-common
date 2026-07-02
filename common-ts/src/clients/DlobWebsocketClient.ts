'use client';

import { MarketId } from '../types/MarketId';
import { deserializeL2Response } from '../utils/orderbook';
import {
	OrderbookGrouping,
	DLOB_SERVER_WEBSOCKET_UTILS,
	DlobServerChannel,
} from '../utils/dlob-server/DlobServerWebsocketUtils';
import { Observable, Subject, BehaviorSubject, EMPTY } from 'rxjs';
import {
	map,
	filter,
	catchError,
	takeUntil,
	share,
	distinctUntilChanged,
	switchMap,
} from 'rxjs/operators';
import { ResultSlotIncrementer } from '../utils/ResultSlotIncrementer';
import { MultiplexWebSocket } from '../utils/MultiplexWebSocket';
import { logger } from '../utils/logger';
import { RawL2Output } from '../utils/orderbook/types';

export type OrderbookChannelTypes = Extract<
	DlobServerChannel,
	'orderbook' | 'orderbook_indicative'
>;

export interface DlobWebsocketClientConfig {
	websocketUrl: string;
	enableIndicativeOrderbook?: boolean;
	resultSlotIncrementer?: ResultSlotIncrementer;
	onFallback?: (marketId: MarketId) => void;
}

export interface MarketSubscription {
	marketId: MarketId;
	channel: OrderbookChannelTypes;
	grouping?: OrderbookGrouping;
}

export interface ProcessedMarketData {
	marketId: MarketId;
	rawData: RawL2Output;
	deserializedData: ReturnType<typeof deserializeL2Response>;
	slot: number;
}

export class DlobWebsocketClient {
	private config: DlobWebsocketClientConfig;
	private subscriptions = new Map<string, { unsubscribe: () => void }>();
	private resultIncrementer: ResultSlotIncrementer;
	private destroy$ = new Subject<void>();

	// String caches to prevent repeated string concatenation
	private static readonly stringCache = new Map<string, string>();
	private static readonly maxCacheSize = 1000;

	// Subjects for reactive streams
	private marketSubscriptions$ = new BehaviorSubject<MarketSubscription[]>([]);
	private rawMessages$ = new Subject<{
		marketId: MarketId;
		channel: string;
		data: string;
	}>();

	constructor(config: DlobWebsocketClientConfig) {
		this.config = config;
		this.resultIncrementer =
			config.resultSlotIncrementer || new ResultSlotIncrementer();

		this.setupSubscriptionManagement();
	}

	/**
	 * Get an observable stream of processed market data for specific markets
	 */
	getMarketDataStream(marketIds: MarketId[]): Observable<ProcessedMarketData> {
		return this.rawMessages$.pipe(
			filter(({ marketId }) => marketIds.some((id) => id.key === marketId.key)),
			map(({ marketId, channel, data }) =>
				this.processRawMessage(marketId, channel, data)
			),
			filter((result): result is ProcessedMarketData => result !== null),
			catchError((error) => {
				logger.error('Caught error in getMarketDataStream', error);
				return EMPTY;
			}),
			takeUntil(this.destroy$),
			share()
		);
	}

	/**
	 * Subscribe to market data for given markets
	 */
	subscribeToMarkets(
		markets: {
			marketId: MarketId;
			grouping?: OrderbookGrouping;
		}[]
	): void {
		const subscriptions: MarketSubscription[] = markets.map(
			({ marketId, grouping }) => ({
				marketId,
				channel: this.config.enableIndicativeOrderbook
					? 'orderbook_indicative'
					: 'orderbook',
				grouping,
			})
		);

		this.marketSubscriptions$.next(subscriptions);
	}

	/**
	 * Unsubscribe from all markets
	 */
	unsubscribeAll(): void {
		this.marketSubscriptions$.next([]);
	}

	/**
	 * Handle tab return to prevent "speed run" through queued messages
	 */
	handleTabReturn(): void {
		this.resultIncrementer.handleTabReturn();
	}

	/**
	 * Reset slot tracking for clean state on reconnection
	 */
	resetSlotTracking(): void {
		// Get all current subscription keys and reset their slot tracking
		for (const subscriptionKey of this.subscriptions.keys()) {
			// Extract marketId and channel from subscription key
			const [marketKey, channel] = subscriptionKey.split('_');
			const resultKey = this.getCachedString(
				`${channel}_${marketKey}`,
				'result'
			);
			this.resultIncrementer.resetKey(resultKey);
		}
	}

	/**
	 * Cache frequently used strings to reduce memory allocation
	 */
	private getCachedString(baseString: string, type: string): string {
		const cacheKey = `${type}:${baseString}`;

		if (DlobWebsocketClient.stringCache.has(cacheKey)) {
			return DlobWebsocketClient.stringCache.get(cacheKey)!;
		}

		// If cache is getting too large, clear oldest entries
		if (
			DlobWebsocketClient.stringCache.size >= DlobWebsocketClient.maxCacheSize
		) {
			const firstKey = DlobWebsocketClient.stringCache.keys().next().value;
			DlobWebsocketClient.stringCache.delete(firstKey);
		}

		DlobWebsocketClient.stringCache.set(cacheKey, baseString);
		return baseString;
	}

	/**
	 * Destroy the client and clean up all subscriptions
	 */
	destroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.subscriptions.forEach(({ unsubscribe }) => unsubscribe());
		this.subscriptions.clear();
	}

	/**
	 * Sets up the subscription management pipeline that handles market data subscriptions.
	 * This pipeline:
	 * 1. Watches for changes in market subscriptions
	 * 2. Only processes changes when the subscription list actually changes
	 * 3. Manages the lifecycle of websocket subscriptions
	 * 4. Cleans up when the client is destroyed
	 */
	private setupSubscriptionManagement(): void {
		this.marketSubscriptions$
			.pipe(
				// Only emit when the subscription list actually changes
				// Uses JSON.stringify for deep comparison of subscription arrays
				distinctUntilChanged(
					(prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
				),
				// Switch to managing the new set of subscriptions
				// This will cancel any previous subscription management
				switchMap((subscriptions) =>
					this.manageNewSubscriptions(subscriptions)
				),
				// Clean up when the client is destroyed
				takeUntil(this.destroy$)
			)
			.subscribe();
	}

	/**
	 * Manages the lifecycle of websocket subscriptions by:
	 * 1. Comparing current subscriptions with new subscriptions
	 * 2. Unsubscribing from any subscriptions that are no longer needed
	 * 3. Creating new subscriptions for markets that weren't previously subscribed
	 *
	 * @param newSubscriptions - The new set of market subscriptions to maintain
	 * @returns An empty observable since this is a side-effect operation
	 */
	private manageNewSubscriptions(
		newSubscriptions: MarketSubscription[]
	): Observable<never> {
		// Get sets of subscription keys for efficient comparison
		const currentKeys = new Set(this.subscriptions.keys());
		const newKeys = new Set(
			newSubscriptions.map((sub) => this.getSubscriptionKey(sub))
		);

		// Unsubscribe from removed subscriptions
		for (const key of currentKeys) {
			if (!newKeys.has(key)) {
				const subscription = this.subscriptions.get(key);
				if (subscription) {
					subscription.unsubscribe();
					this.subscriptions.delete(key);
				}
			}
		}

		// Subscribe to new subscriptions
		for (const subscription of newSubscriptions) {
			const key = this.getSubscriptionKey(subscription);
			if (!currentKeys.has(key)) {
				this.createSubscription(subscription);
			}
		}

		return EMPTY;
	}

	private createSubscription(subscription: MarketSubscription): void {
		const { marketId, channel, grouping } = subscription;
		const subscriptionKey = this.getSubscriptionKey(subscription);

		try {
			const { unsubscribe } = MultiplexWebSocket.createWebSocketSubscription<{
				channel: string;
				data: string;
			}>({
				wsUrl: this.config.websocketUrl,
				enableHeartbeatMonitoring: true,
				subscriptionId: this.getCachedString(
					`${this.config.websocketUrl}_dlob_liquidity_${marketId.key}`,
					'subscription'
				),
				subscribeMessage: JSON.stringify(
					DLOB_SERVER_WEBSOCKET_UTILS.getSubscriptionProps({
						type: channel,
						market: marketId,
						grouping,
					})
				),
				unsubscribeMessage: JSON.stringify(
					DLOB_SERVER_WEBSOCKET_UTILS.getUnsubscriptionProps({
						type: channel,
						market: marketId,
						grouping,
					})
				),
				onMessage: (message: { channel: string; data: string }) => {
					this.rawMessages$.next({
						marketId,
						channel: message.channel,
						data: message.data,
					});
				},
				messageFilter: (message: { channel: string; data: string }) => {
					return DLOB_SERVER_WEBSOCKET_UTILS.getMessageFilter({
						type: channel,
						market: marketId,
						grouping,
					})(message);
				},
				onError: (error?: any) => {
					logger.error('Caught error in createSubscription', error);
					this.config.onFallback?.(marketId);
				},
				errorMessageFilter: (message?: any) => {
					if (message?.error) {
						return true;
					}
					return false;
				},
			});

			this.subscriptions.set(subscriptionKey, { unsubscribe });
		} catch (error) {
			logger.error('Failed to create subscription:', error);
			this.config.onFallback?.(marketId);
		}
	}

	private processRawMessage(
		marketId: MarketId,
		channel: string,
		data: string
	): ProcessedMarketData | null {
		try {
			const parsed = this.tryParse(data) as RawL2Output;
			const resultKey = this.getCachedString(
				`${channel}_${marketId.key}`,
				'result'
			);
			const messageTimestamp = Date.now(); // Capture when we received this message

			const validResult = this.resultIncrementer.handleResult(
				resultKey,
				parsed.slot ?? 0,
				messageTimestamp
			);

			if (!validResult) {
				return null; // Skip results which aren't slot-increasing or are filtered due to tab return
			}

			const deserializedData = deserializeL2Response(parsed);

			return {
				marketId,
				rawData: parsed,
				deserializedData,
				slot: parsed.slot ?? 0,
			};
		} catch (error) {
			return null;
		}
	}

	private tryParse(data: unknown): unknown {
		try {
			return JSON.parse(data as string, (key, value) => {
				// If the value is a number and it's too large to be safely represented as a JavaScript number,
				// convert it to a string to prevent precision loss
				if (typeof value === 'number' && !Number.isSafeInteger(value)) {
					return value.toString();
				}
				return value;
			});
		} catch (e) {
			return data;
		}
	}

	private getSubscriptionKey(subscription: MarketSubscription): string {
		const { marketId, channel, grouping } = subscription;
		const baseKey = `${marketId.key}_${channel}${
			grouping ? `_${grouping}` : ''
		}`;
		return this.getCachedString(baseKey, 'subscription_key');
	}
}

export default DlobWebsocketClient;

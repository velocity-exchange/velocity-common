import { CandleResolution } from '@velocity-exchange/sdk';
import { MarketSymbol, Opaque } from '../types';
import { Subject } from 'rxjs';
import { DataApiWsClient } from './dataApiWsClient';
import { JsonCandle } from 'src/types';
import { JsonTrade } from 'src/types';
import { UIEnv } from '../types';
import assert from 'assert';
import invariant from 'tiny-invariant';
import { logger } from '../utils/logger';

/*

# Internal/Functional explanation of the MarketDataFeed class

This class was implmented as a singleton so that we can avoid making duplicate websockets where they are not necessary.

One key thing to understand about the logic is that on the API side, there is only a "single" websocket available which is to subscribe to CANDLES.

Each of these "candles" websockets also returns the TRADES which resulted in the updated candle.

To ensure that trades and candles are in sync, we want to make sure that subscriptions for these things (which is done seperately) actually use the same websocket connection. Which is why this class is necessary.

## Explanation of terminology:
- A "subscription" is an actual underlying websocket connection to the Velocity Data API. A subscription may have multiple subscribers attached to it, where the data coming through that subscription is sufficient for the subsciption config. A Subscription can have the data for both CANDLES and TRADES subscribers.
- A "subscriber" is a specific instance of an external party making a subscription. It is either a TRADE or CANDLE subscriber.
- A "subscriber subscription" represents the subscription information that we return to an external subscriber. It contains the subscription ID they can use to unsubscriber, an an observable to listen to the data.

## Explanation for tradeSubscriptionLookup and candleSubscriptionLookup:
This class supports subscribing to multiple arbitrary markets (and candle resolutions) at the same time. It also supports sharing a single websocket connection between multiple subscribers where possible. This creates one bit of complexity where we need to search for existing "compatible" subscriptions whenever a new subscriber comes through. Example:
- Imagine a CANDLE subscription for SOL-PERP-Resolution-1 (Subscription A).
- When a TRADE subscription comes through for SOL-PERP (Subscription B) we want it to use the same websocket connection as Subscription A, because they are for the same market - even though they are different subscription types. We use the `tradeSubscriptionLookup` to see that there is an existing subscription for this market and then attach the new trade subscriber to it.
- When another CANDLE subscription comes through for SOL-PERP-Resolution-5 (Subscription C), there is no existing subscription in the `candleSubscriptionsLookup`, because the resolution is different. Hence we create a new subscription.
- TO SUMMARISE :: A trade subscription can share any subscription with the same market. But a candle subscription must share the same market AND resolution. We use seperate lookup tables to index into compatible subscriptions.

There is a minor inefficiency remaining in this implementation, where to be optimal we may want to "re-organise" subscriptions when they close. E.g.:
- <open> SOL-PERP-Resolution-1 (Subscriber A) => will create new Subscription A
- <open> SOL-PERP-Resolution-5 (Subscriber B) => will create new Subscription B
- <open> SOL-PERP-TRADE (Subscriber C) => will use existing Subscription A
- <close> SOL-PERP-Resolution-1 (Subscriber A) => will keep Subscription A open because Subscriber C is still listening
- * We could more optimally close Subscription A and make Subscriber C use Subscription B
- * We're not doing this for the same of simplicity. In the future we could add this optimisation if it becomes necessary.

---

## Explanation of each of the classes in this file and their purpose:

### Core Data Classes:
- **SubscriberSubscription (abstract)**: Base class for subscription objects returned to external consumers. Contains an ID and an observable for receiving data.
- **CandleSubscriberSubscription**: Concrete implementation for candle data subscriptions, emits JsonCandle objects.
- **TradeSubscriberSubscription**: Concrete implementation for trade data subscriptions, emits JsonTrade[] arrays.

### Internal Subscriber Management:
- **_Subscriber (abstract)**: Base class for internal subscriber management. Tracks subscriber config, generates unique IDs, and manages the connection to ApiSubscription.
- **CandleSubscriber**: Internal subscriber for candle data, creates and manages a Subject<JsonCandle> for data distribution.
- **TradeSubscriber**: Internal subscriber for trade data, creates and manages a Subject<JsonTrade[]> for data distribution.

### WebSocket Connection Management:
- **ApiSubscription**: Manages a single websocket connection to the Velocity Data API. Can serve multiple subscribers (both candle and trade) if they're compatible. Handles the actual API communication and data distribution to attached subscribers.

### Subscription Discovery and Sharing:
- **SubscriptionLookup (abstract)**: Base class for lookup tables that help find compatible existing subscriptions for new subscribers.
- **TradeSubscriptionLookup**: Manages lookup table for trade subscriptions. Multiple ApiSubscriptions can be compatible for trade subscribers (any subscription for the same market works).
- **CandleSubscriptionLookup**: Manages lookup table for candle subscriptions. Only one ApiSubscription per market+resolution combination.

### Core Orchestration:
- **SubscriptionManager**: The main orchestrator that handles all subscription logic, manages the lifecycle of subscribers and ApiSubscriptions, handles subscription sharing and transfer optimization.
- **MarketDataFeed**: Public singleton interface that external code uses to subscribe/unsubscribe. Delegates all work to the internal SubscriptionManager.
*/

type SubscriptionType = 'candles' | 'trades';

interface ISubscriptionConfig<T extends SubscriptionType> {
	readonly type: T;
	readonly env: UIEnv;
	marketSymbol: MarketSymbol;
}
type CandleSubscriptionConfig = ISubscriptionConfig<'candles'> & {
	resolution: CandleResolution;
};
type TradeSubscriptionConfig = ISubscriptionConfig<'trades'>;
type SubscriptionConfig = CandleSubscriptionConfig | TradeSubscriptionConfig;

type SubscriberId = Opaque<string, 'SubscriberId'>;
type ApiSubscriptionId = Opaque<string, 'ApiSubscriptionId'>;

type CandleSubscriptionLookupKey = Opaque<
	string,
	'CandleSubscriptionLookupKey'
>;
type TradeSubscriptionLookupKey = Opaque<string, 'TradeSubscriptionLookupKey'>;

const DEFAULT_CANDLE_RESOLUTION_FOR_TRADE_SUBSCRIPTIONS: CandleResolution = '1';

abstract class SubscriberSubscription<T> {
	public readonly id: SubscriberId;
	private readonly _subject: Subject<T>;

	public get observable() {
		return this._subject.asObservable();
	}

	constructor(id: SubscriberId, subject: Subject<T>) {
		this.id = id;
		this._subject = subject;
	}
}

export class CandleSubscriberSubscription extends SubscriberSubscription<JsonCandle> {
	constructor(id: SubscriberId, subject: Subject<JsonCandle>) {
		super(id, subject);
	}
}

export class TradeSubscriberSubscription extends SubscriberSubscription<
	JsonTrade[]
> {
	constructor(id: SubscriberId, subject: Subject<JsonTrade[]>) {
		super(id, subject);
	}
}

abstract class _Subscriber<T> {
	public readonly id: SubscriberId;
	public readonly config: SubscriptionConfig;
	protected _apiSubscription!: ApiSubscription;
	protected subject!: Subject<T>;
	private static idIncrementer: number = 0;

	public get subscription(): ApiSubscription {
		return this._apiSubscription;
	}

	private generateSubscriberId(): SubscriberId {
		return `${this.config?.type}:${this.config?.marketSymbol}:${
			this.config?.env.key
		}:(${_Subscriber.idIncrementer++})` as SubscriberId;
	}

	constructor(config: SubscriptionConfig) {
		this.config = { ...config }; // Make a copy of the config to avoid mutability issues
		this.id = this.generateSubscriberId();
	}

	setSubscription(subscription: ApiSubscription) {
		this._apiSubscription = subscription;
	}

	next(data: T) {
		this.subject.next(data);
	}
}

class CandleSubscriber extends _Subscriber<JsonCandle> {
	public declare readonly config: CandleSubscriptionConfig;
	public readonly subscriberSubscription: CandleSubscriberSubscription;

	constructor(config: CandleSubscriptionConfig) {
		super(config);
		this.subject = new Subject<JsonCandle>();
		this.subscriberSubscription = new CandleSubscriberSubscription(
			this.id,
			this.subject
		);
	}
}

class TradeSubscriber extends _Subscriber<JsonTrade[]> {
	public declare readonly config: TradeSubscriptionConfig;
	public readonly subscriberSubscription: TradeSubscriberSubscription;

	constructor(config: TradeSubscriptionConfig) {
		super(config);
		this.subject = new Subject<JsonTrade[]>();
		this.subscriberSubscription = new TradeSubscriberSubscription(
			this.id,
			this.subject
		);
	}
}

type Subscriber = CandleSubscriber | TradeSubscriber;

function getCompatibleCandleSubscriptionLookupKey(
	config: Pick<CandleSubscriptionConfig, 'marketSymbol' | 'resolution' | 'env'>
): CandleSubscriptionLookupKey {
	return `${config.marketSymbol}:${config.resolution}:${config.env.key}` as CandleSubscriptionLookupKey;
}

function getCompatibleTradeSubscriptionLookupKey(
	config: Pick<CandleSubscriptionConfig, 'marketSymbol' | 'env'>
): TradeSubscriptionLookupKey {
	return `${config.marketSymbol}:${config.env.key}` as TradeSubscriptionLookupKey;
}

class ApiSubscription {
	public readonly id: ApiSubscriptionId;
	public readonly candleSubscribers: Map<SubscriberId, CandleSubscriber>;
	public readonly tradeSubscribers: Map<SubscriberId, TradeSubscriber>;
	public readonly config: Pick<
		CandleSubscriptionConfig,
		'marketSymbol' | 'resolution' | 'env'
	>;
	private apiClient: DataApiWsClient;
	private onNoMoreSubscribers: () => void;
	private static idIncrementer: number = 0;

	private generateSubscriptionId(): ApiSubscriptionId {
		return `${getCompatibleCandleSubscriptionLookupKey(
			this.config
		)}(${ApiSubscription.idIncrementer++})` as ApiSubscriptionId;
	}

	/**
	 * Any trade subscription with a matching key can use this ApiSubscription.
	 */
	get tradeSubscriptionsLookupKey() {
		return getCompatibleTradeSubscriptionLookupKey(this.config);
	}

	/**
	 * Any candle subscription with a matching key can use this ApiSubscription.
	 */
	get candleSubscriptionsLookupKey() {
		return getCompatibleCandleSubscriptionLookupKey(this.config);
	}

	constructor(
		resolution: CandleResolution,
		initialSubscriber: Subscriber,
		onNoMoreSubscribers: (subscription: ApiSubscriptionId) => void
	) {
		const marketSymbol = initialSubscriber.config.marketSymbol;
		const env = initialSubscriber.config.env;
		this.config = { marketSymbol, resolution, env };
		this.id = this.generateSubscriptionId();
		this.onNoMoreSubscribers = () => onNoMoreSubscribers(this.id);
		logger.debug(`marketDataFeed::creating_new_api_subscription:${this.id}`);

		const initialSubscriberType = initialSubscriber.config.type;

		this.apiClient = new DataApiWsClient({
			marketSymbol: this.config.marketSymbol,
			resolution: this.config.resolution,
			env: this.config.env,
		});

		initialSubscriber.setSubscription(this);

		switch (initialSubscriberType) {
			case 'candles': {
				this.candleSubscribers = new Map([
					[initialSubscriber.id, initialSubscriber as CandleSubscriber],
				]);
				this.tradeSubscribers = new Map();
				break;
			}
			case 'trades': {
				this.candleSubscribers = new Map();
				this.tradeSubscribers = new Map([
					[initialSubscriber.id, initialSubscriber as TradeSubscriber],
				]);
				break;
			}
			default: {
				const _never: never = initialSubscriberType;
				throw new Error(`Unknown subscription type: ${_never}`);
			}
		}

		this.subscribeToApi();
	}

	private async subscribeToApi() {
		await this.apiClient.subscribe();
		this.apiClient.candlesObservable.subscribe((candle) => {
			this.candleSubscribers.forEach((subscriber) => {
				subscriber.next(candle);
			});
		});
		this.apiClient.tradesObservable.subscribe((trades) => {
			this.tradeSubscribers.forEach((subscriber) => {
				subscriber.next(trades);
			});
		});
	}

	public attachNewCandleSubscriberToExistingSubscription(
		subscriber: CandleSubscriber
	) {
		subscriber.setSubscription(this);
		this.candleSubscribers.set(subscriber.id, subscriber);
	}

	public attachNewTradeSubscriberToExistingSubscription(
		subscriber: TradeSubscriber
	) {
		subscriber.setSubscription(this);
		this.tradeSubscribers.set(subscriber.id, subscriber);
	}

	private unsubscribeFromApi() {
		logger.debug(`marketDataFeed::unsubscribing_api_subscription:${this.id}`);
		this.apiClient.unsubscribe();
	}

	public removeSubscriber(subscriberId: SubscriberId) {
		this.candleSubscribers.delete(subscriberId);
		this.tradeSubscribers.delete(subscriberId);

		// Handle the case where there are no more subscribers for this subscription
		if (this.candleSubscribers.size === 0 && this.tradeSubscribers.size === 0) {
			this.unsubscribeFromApi();
			this.onNoMoreSubscribers();
		}
	}
}

abstract class SubscriptionLookup {
	abstract add(apiSubscription: ApiSubscription): void;
	abstract get(subscriptionLookupKey: string): ApiSubscription | null;
	abstract remove(apiSubscription: ApiSubscription): void;
	has(subscriptionLookupKey: string): boolean {
		return !!this.get(subscriptionLookupKey);
	}
}

class TradeSubscriptionLookup extends SubscriptionLookup {
	private subscriptions: Map<TradeSubscriptionLookupKey, ApiSubscription[]> =
		new Map();

	constructor() {
		super();
	}

	add(apiSubscription: ApiSubscription): void {
		const subscriptions = this.subscriptions.get(
			apiSubscription.tradeSubscriptionsLookupKey
		);

		if (!subscriptions) {
			this.subscriptions.set(apiSubscription.tradeSubscriptionsLookupKey, [
				apiSubscription,
			]);
		} else {
			subscriptions.push(apiSubscription);
		}
	}

	get(
		subscriptionLookupKey: TradeSubscriptionLookupKey
	): ApiSubscription | null {
		return this.subscriptions.get(subscriptionLookupKey)?.[0] ?? null;
	}

	getAll(subscriptionLookupKey: TradeSubscriptionLookupKey): ApiSubscription[] {
		return this.subscriptions.get(subscriptionLookupKey) ?? [];
	}

	remove(apiSubscription: ApiSubscription): void {
		const subscriptionLookupKey = apiSubscription.tradeSubscriptionsLookupKey;
		const apiSubscriptionId = apiSubscription.id;

		const subscriptions = this.subscriptions.get(subscriptionLookupKey);

		if (!subscriptions) return;

		const index = subscriptions.findIndex(
			(subscription) => subscription.id === apiSubscriptionId
		);

		if (index === -1) return;

		subscriptions.splice(index, 1);

		// Clean up empty arrays to prevent memory leaks and ensure has() works correctly
		if (subscriptions.length === 0) {
			this.subscriptions.delete(subscriptionLookupKey);
		}
	}

	has(subscriptionLookupKey: TradeSubscriptionLookupKey) {
		return super.has(subscriptionLookupKey);
	}
}

class CandleSubscriptionLookup extends SubscriptionLookup {
	private subscriptions: Map<CandleSubscriptionLookupKey, ApiSubscription> =
		new Map();

	constructor() {
		super();
	}

	add(apiSubscription: ApiSubscription): void {
		this.subscriptions.set(
			apiSubscription.candleSubscriptionsLookupKey,
			apiSubscription
		);
	}

	get(
		subscriptionLookupKey: CandleSubscriptionLookupKey
	): ApiSubscription | null {
		return this.subscriptions.get(subscriptionLookupKey) ?? null;
	}

	remove(apiSubscription: ApiSubscription): void {
		const subscriptionLookupKey = apiSubscription.candleSubscriptionsLookupKey;
		this.subscriptions.delete(subscriptionLookupKey);
	}

	has(subscriptionLookupKey: CandleSubscriptionLookupKey) {
		return super.has(subscriptionLookupKey);
	}
}

/**
 * Internal class that manages the complex subscription orchestration logic.
 * This handles subscription sharing, transfer logic, and lifecycle management.
 */
class SubscriptionManager {
	// Stores all current subscribers
	private subscribers = new Map<SubscriberId, Subscriber>();

	// Stores all current subscriptions :: subscribers:subscriptions is N:M (Subscribers may share a subscription but not vice versa)
	private apiSubscriptions = new Map<ApiSubscriptionId, ApiSubscription>();

	// Lookup table for any existing subscriptions which have a compatible configuration for a trade subscriber. Can be multiple compatible subscriptions for a trade subscriber.
	private compatibleTradeSubscriptionLookup = new TradeSubscriptionLookup();

	// Lookup table for any existing subscriptions which have a compatible configuration for a candle subscriber. Should only be one compatible subscription for a candle subscriber.
	private compatibleCandleSubscriptionLookup = new CandleSubscriptionLookup();

	/**
	 * Handles a new subscription by adding it to the necessary lookup tables
	 * @param subscription
	 */
	private handleNewApiSubscription(subscription: ApiSubscription) {
		this.apiSubscriptions.set(subscription.id, subscription);

		// Add to the trade subscription compatibility lookup
		this.compatibleTradeSubscriptionLookup.add(subscription);

		// Add to the candle subscription compatibility lookup if a previous one suiting this subscription doesn't already exist
		if (
			!this.compatibleCandleSubscriptionLookup.has(
				subscription.candleSubscriptionsLookupKey
			)
		) {
			this.compatibleCandleSubscriptionLookup.add(subscription);
		}

		this.checkForTradeSubscriptionTransferForNewSubscription(subscription);
	}

	private transferTradeSubscribersToNewSubscription(
		existingTradeSubscription: ApiSubscription,
		newSubscription: ApiSubscription
	) {
		invariant(
			existingTradeSubscription.id !== newSubscription.id,
			'Expected different subscriptions when transferring trade subscribers'
		);
		invariant(
			existingTradeSubscription.candleSubscribers.size === 0,
			'Expected existing trade subscription to have no candle subscribers when transferring trade subscribers'
		);

		// Transfer the subscribers to the new subscription
		const tradeSubscribers = Array.from(
			existingTradeSubscription.tradeSubscribers.values()
		);

		if (tradeSubscribers.length === 0) return; // Skip early if there are no trade subscribers to transfer

		logger.debug(
			`marketDataFeed::transferring_previous_trade_subscribers_to_new_subscription`
		);

		tradeSubscribers.forEach((tradeSubscriber) => {
			newSubscription.attachNewTradeSubscriberToExistingSubscription(
				tradeSubscriber
			);

			existingTradeSubscription.removeSubscriber(tradeSubscriber.id);
		});
	}

	/**
	 * When we have a new subscription, we want to check if there is an existing subscription with trade subscribers which should be transferred to the new subscription.
	 *
	 * Reasoning:
	 * - If a TRADE SUBSCRIBER caused a new subscription to be created
	 * - and then a following CANDLE SUBSCRIBER is created for the same market
	 * => then it is wasteful to keep the previous trade subscription open, because the new candle subscription can collect the data for both subscribers
	 *
	 * @param newSubscription
	 */
	private checkForTradeSubscriptionTransferForNewSubscription(
		newSubscription: ApiSubscription
	) {
		const tradeSubscriptionLookupKey =
			newSubscription.tradeSubscriptionsLookupKey;

		invariant(
			!!this.compatibleTradeSubscriptionLookup.get(tradeSubscriptionLookupKey),
			`Expect a matching trade subscription when checking for transfers for a new subscription`
		);

		const allCompatibleTradeSubscriptions =
			this.compatibleTradeSubscriptionLookup.getAll(tradeSubscriptionLookupKey);

		for (const existingTradeSubscription of allCompatibleTradeSubscriptions) {
			if (existingTradeSubscription.id === newSubscription.id) continue; // If the subscription is the current subscription, then there are no subscribers to transfer.
			if (existingTradeSubscription.candleSubscribers.size > 0) continue; // If the existing subscription has candle subscribers, skip doing any transfers because it's not any extra efficient to do so.

			this.transferTradeSubscribersToNewSubscription(
				existingTradeSubscription,
				newSubscription
			);
		}
	}

	/**
	 * When a subscriber unsubscribes and causes the subscription to have some remaining trade subscribers, but no candle subscribers, we want to check if there is another compatible subscription to transfer the trade subscribers to.
	 * @param apiSubscription
	 */
	private checkForSubscriptionTransferOnUnsubscribe(
		apiSubscription: ApiSubscription
	) {
		if (apiSubscription.tradeSubscribers.size === 0) return; // Skip early if there are no trade subscribers to transfer
		if (apiSubscription.candleSubscribers.size > 0) return; // Skip early if there are candle subscribers

		// Look for another compatible subscription to transfer the trade subscribers to
		const tradeSubscriptionLookupKey =
			apiSubscription.tradeSubscriptionsLookupKey;

		// Get all compatible subscriptions for this market
		const compatibleSubscriptions =
			this.compatibleTradeSubscriptionLookup.getAll(tradeSubscriptionLookupKey);

		if (!compatibleSubscriptions || compatibleSubscriptions.length <= 1) {
			// No other compatible subscriptions available, or only this subscription exists
			return;
		}

		// Find a different subscription that can accept the trade subscribers
		const targetSubscription = compatibleSubscriptions.find(
			(subscription) => subscription.id !== apiSubscription.id
		);

		if (!targetSubscription) {
			// No suitable target subscription found
			return;
		}

		logger.debug(
			`marketDataFeed::transferring_trade_subscribers_on_unsubscribe`
		);

		// Transfer all trade subscribers to the target subscription
		this.transferTradeSubscribersToNewSubscription(
			apiSubscription,
			targetSubscription
		);
	}

	private handleNewCandleSubscriber(subscriber: CandleSubscriber) {
		const candleSubscriptionLookupKey =
			getCompatibleCandleSubscriptionLookupKey(subscriber.config);
		const hasExistingSuitableSubscription =
			this.compatibleCandleSubscriptionLookup.has(candleSubscriptionLookupKey);

		if (hasExistingSuitableSubscription) {
			logger.debug(
				`marketDataFeed::attaching_new_candle_subscriber_to_existing_subscription`
			);
			const existingSubscription = this.compatibleCandleSubscriptionLookup.get(
				candleSubscriptionLookupKey
			);
			if (!existingSubscription) {
				throw new Error(
					`No existing subscription found for candle subscription lookup key ${candleSubscriptionLookupKey}`
				);
			}
			existingSubscription.attachNewCandleSubscriberToExistingSubscription(
				subscriber
			);
		} else {
			logger.debug(`marketDataFeed::creating_new_candle_subscription`);
			const newSubscription = new ApiSubscription(
				subscriber.config.resolution,
				subscriber,
				this.cleanupApiSubscription.bind(this)
			);

			this.handleNewApiSubscription(newSubscription);
		}

		assert(
			this.subscribers.has(subscriber.id),
			'Subscriber should be added to subscribers map'
		);
	}

	private handleNewTradeSubscriber(subscriber: TradeSubscriber) {
		// Check if any existing subscriptions already suit the new subscriber
		const tradeSubscriptionLookupKey = getCompatibleTradeSubscriptionLookupKey(
			subscriber.config
		);
		const hasExistingSuitableSubscription =
			this.compatibleTradeSubscriptionLookup.has(tradeSubscriptionLookupKey);

		if (hasExistingSuitableSubscription) {
			logger.debug(
				`marketDataFeed::attaching_new_trade_subscriber_to_existing_subscription`
			);
			const existingSubscription = this.compatibleTradeSubscriptionLookup.get(
				tradeSubscriptionLookupKey
			);
			if (!existingSubscription) {
				throw new Error(
					`No existing subscription found for trade subscription lookup key ${tradeSubscriptionLookupKey}`
				);
			}
			existingSubscription.attachNewTradeSubscriberToExistingSubscription(
				subscriber
			);
		} else {
			logger.debug(`marketDataFeed::creating_new_trade_subscription`);
			const newSubscription = new ApiSubscription(
				DEFAULT_CANDLE_RESOLUTION_FOR_TRADE_SUBSCRIPTIONS,
				subscriber,
				this.cleanupApiSubscription.bind(this)
			);
			this.handleNewApiSubscription(newSubscription);
		}

		assert(
			this.subscribers.has(subscriber.id),
			'Subscriber should be added to subscribers map'
		);
	}

	/**
	 * This method gets called when we no longer need an ApiSubscription and can close it down completely.
	 * @param apiSubscriptionId
	 */
	private cleanupApiSubscription(apiSubscriptionId: ApiSubscriptionId) {
		const apiSubscription = this.apiSubscriptions.get(apiSubscriptionId);

		invariant(
			apiSubscription,
			`Api subscription not found for id ${apiSubscriptionId}`
		);
		invariant(
			apiSubscription.candleSubscribers.size === 0,
			'Expected api subscription to have no candle subscribers when cleaning up'
		);
		invariant(
			apiSubscription.tradeSubscribers.size === 0,
			'Expected api subscription to have no trade subscribers when cleaning up'
		);

		// Remove the subscription from the lookup tables
		this.compatibleTradeSubscriptionLookup.remove(apiSubscription);
		this.compatibleCandleSubscriptionLookup.remove(apiSubscription);

		// We can delete the subscription from the lookup table when we're cleaning up an ApiSubscription
		this.apiSubscriptions.delete(apiSubscriptionId);
	}

	/**
	 * Creates a new subscriber and manages its subscription lifecycle
	 */
	public subscribe(
		config: SubscriptionConfig
	): CandleSubscriberSubscription | TradeSubscriberSubscription {
		switch (config.type) {
			case 'candles': {
				// Create the new Subscriber
				const newSubscriber = new CandleSubscriber(config);

				// Add to current subscribers
				this.subscribers.set(newSubscriber.id, newSubscriber);

				this.handleNewCandleSubscriber(newSubscriber);

				return newSubscriber.subscriberSubscription;
			}
			case 'trades': {
				// Create the new Subscriber
				const newSubscriber = new TradeSubscriber(config);

				// Add to current subscribers
				this.subscribers.set(newSubscriber.id, newSubscriber);

				this.handleNewTradeSubscriber(newSubscriber);

				return newSubscriber.subscriberSubscription;
			}
			default: {
				const _never: never = config;
				throw new Error(`Unknown subscription type: ${_never}`);
			}
		}
	}

	/**
	 * Removes a subscriber and cleans up resources as needed
	 */
	public unsubscribe(subscriberId: SubscriberId) {
		const subscriber = this.subscribers.get(subscriberId);

		if (!subscriber) {
			throw new Error(`Subscriber not found: ${subscriberId}`);
		}

		const apiSubscription = subscriber.subscription;

		apiSubscription.removeSubscriber(subscriberId);

		this.checkForSubscriptionTransferOnUnsubscribe(apiSubscription);

		this.subscribers.delete(subscriberId);
	}
}

/**
 * This class will handle subscribing to market data from the Drift Data API's websocket. See https://data.api.drift.trade/playground for more information about the API.
 *
 * It currently supports subscribing to candles and to trades.
 */
export class MarketDataFeed {
	private static subscriptionManager = new SubscriptionManager();

	public static subscribe(
		config: CandleSubscriptionConfig
	): CandleSubscriberSubscription;
	public static subscribe(
		config: TradeSubscriptionConfig
	): TradeSubscriberSubscription;
	public static subscribe(
		config: SubscriptionConfig
	): CandleSubscriberSubscription | TradeSubscriberSubscription {
		return this.subscriptionManager.subscribe(config);
	}

	public static unsubscribe(subscriberId: SubscriberId) {
		this.subscriptionManager.unsubscribe(subscriberId);
	}
}

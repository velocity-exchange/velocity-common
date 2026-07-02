import { Subject, Subscription, catchError } from 'rxjs';
import WebSocket, { MessageEvent } from 'isomorphic-ws';
import { logger } from './logger';

type WebSocketMessage<T = Record<string, unknown>> = T;

type WebSocketSubscriptionProps<T = Record<string, unknown>> = {
	wsUrl: string;
	subscriptionId: string;
	subscribeMessage: string;
	unsubscribeMessage: string;
	onError: (err?: any) => void;
	onMessage: (message: WebSocketMessage<T>) => void;
	messageFilter?: (message: WebSocketMessage<T>) => boolean;
	errorMessageFilter?: (message: WebSocketMessage<T>) => boolean;
	onClose?: () => void;
	enableHeartbeatMonitoring?: boolean;
	heartbeatTimeoutMs?: number;
};

type WebSocketSubscriptionState<T = Record<string, unknown>> =
	WebSocketSubscriptionProps<T> & {
		hasSentSubscribeMessage?: boolean;
		subjectSubscription?: Subscription;
	};

type WebSocketUrl = string;
type SubscriptionId = string;

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_MAX_RECONNECT_WINDOW_MS = 60 * 1000;
const DEFAULT_CONNECTION_CLOSE_DELAY_MS = 2 * 1000; // 2 seconds delay before closing connection
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 11 * 1000; // Consider connection dead if no heartbeat within 11 seconds (a little more than twice of 5 seconds, the interval Velocity servers use)

/**
 * Manages reconnection logic for WebSocket connections with exponential backoff and rate limiting.
 *
 * Features:
 * - Tracks reconnection attempts within a time window
 * - Implements exponential backoff (1s, 2s, 4s, 8s max)
 * - Resets attempt counter after configurable time window
 * - Throws error when max attempts exceeded
 * - Provides configurable limits for attempts and time window
 *
 * @example
 * ```ts
 * const manager = new ReconnectionManager(5, 60000); // 5 attempts in 60s
 * const { shouldReconnect, delay } = manager.attemptReconnection('ws://example.com');
 * if (shouldReconnect) {
 *   setTimeout(() => reconnect(), delay);
 * }
 * ```
 */
class ReconnectionManager {
	private reconnectAttempts: number = 0;
	private lastReconnectWindow: number = Date.now();
	private maxAttemptsCount: number;
	private maxAttemptsWindowMs: number;

	constructor(
		maxAttemptsCount = DEFAULT_MAX_RECONNECT_ATTEMPTS,
		maxAttemptsWindowMs = DEFAULT_MAX_RECONNECT_WINDOW_MS
	) {
		this.maxAttemptsCount = maxAttemptsCount;
		this.maxAttemptsWindowMs = maxAttemptsWindowMs;
	}

	public attemptReconnection(wsUrl: string): {
		shouldReconnect: boolean;
		delay: number;
	} {
		const now = Date.now();

		// Reset reconnect attempts if more than a minute has passed
		if (now - this.lastReconnectWindow > this.maxAttemptsWindowMs) {
			this.reconnectAttempts = 0;
			this.lastReconnectWindow = now;
		}

		// Check if we've exceeded the maximum reconnect attempts
		if (this.reconnectAttempts >= this.maxAttemptsCount) {
			throw new Error(
				`WebSocket reconnection failed: Maximum reconnect attempts (${this.maxAttemptsCount}) exceeded within ${this.maxAttemptsWindowMs}ms for ${wsUrl}`
			);
		}

		this.reconnectAttempts++;

		// Calculate exponential backoff delay: 1s, 2s, 4s, 8s, etc. (capped at 8s)
		const backoffDelay = Math.min(
			1000 * Math.pow(2, this.reconnectAttempts - 1),
			8000
		);

		return {
			shouldReconnect: true,
			delay: backoffDelay,
		};
	}

	public reset(): void {
		this.reconnectAttempts = 0;
		this.lastReconnectWindow = Date.now();
	}
}

enum WebSocketConnectionState {
	CONNECTING,
	CONNECTED,
	DISCONNECTING,
	DISCONNECTED,
}

type IMultiplexWebSocket<T = Record<string, unknown>> = {
	wsUrl: WebSocketUrl;
	webSocket: WebSocket;
	customConnectionState: WebSocketConnectionState;
	subject: Subject<WebSocketMessage<T>>;
	subscriptions: Map<
		SubscriptionId,
		Omit<WebSocketSubscriptionProps<T>, 'wsUrl' | 'subscriptionId'>
	>;
};

/**
 * MultiplexWebSocket allows for multiple subscriptions to a single websocket of the same URL, improving efficiency and reducing the number of open connections.
 *
 * This implementation assumes the following:
 * - All websocket streams are treated equally - reconnection attempts are performed at the same standards
 * - All messages returned are in the `WebSocketMessage` format
 * - A single instance of the websocket manager is created for each websocket URL - this means all subscriptions to the same websocket URL will share the same websocket instance
 *
 * Internal implementation details:
 * - The websocket is closed when the number of subscriptions is 0
 * - The websocket will be refreshed (new instance) when it disconnects unexpectedly or errors, until it reaches the maximum number of reconnect attempts
 */
export class MultiplexWebSocket<T = Record<string, unknown>>
	implements IMultiplexWebSocket<T>
{
	/**
	 * A lookup of all websockets by their URL.
	 */
	private static URL_TO_WEBSOCKETS_LOOKUP = new Map<
		WebSocketUrl,
		MultiplexWebSocket<any>
	>();

	/**
	 * A lookup from websocket URL to all subscription IDs for that URL.
	 */
	private static URL_TO_SUBSCRIPTION_IDS_LOOKUP = new Map<
		WebSocketUrl,
		Set<SubscriptionId>
	>();

	wsUrl: WebSocketUrl;
	#webSocket!: WebSocket;
	customConnectionState: WebSocketConnectionState;
	subject: Subject<WebSocketMessage<T>>;
	subscriptions: Map<
		SubscriptionId,
		Omit<WebSocketSubscriptionState<T>, 'wsUrl' | 'subscriptionId'>
	>;
	private reconnectionManager: ReconnectionManager;
	private closeTimeout: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private heartbeatMonitoringEnabled: boolean = false;
	private heartbeatTimeoutMs: number = DEFAULT_HEARTBEAT_TIMEOUT_MS;

	private constructor(
		wsUrl: WebSocketUrl,
		enableHeartbeatMonitoring: boolean = false,
		heartbeatTimeoutMs: number = DEFAULT_HEARTBEAT_TIMEOUT_MS
	) {
		if (MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.has(wsUrl)) {
			throw new Error(
				`Attempting to create a new websocket for ${wsUrl}, but it already exists`
			);
		}

		this.wsUrl = wsUrl;
		this.customConnectionState = WebSocketConnectionState.CONNECTING;
		this.subject = new Subject<WebSocketMessage<T>>();
		this.subscriptions = new Map<
			SubscriptionId,
			Omit<WebSocketSubscriptionProps<T>, 'wsUrl' | 'subscriptionId'>
		>();

		this.reconnectionManager = new ReconnectionManager();
		this.heartbeatMonitoringEnabled = enableHeartbeatMonitoring;
		this.heartbeatTimeoutMs = heartbeatTimeoutMs;

		this.webSocket = new WebSocket(wsUrl);

		MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.set(wsUrl, this);
	}

	/**
	 * Creates a new virtual websocket subscription. If an existing websocket for the given URL exists, the subscription will be added to the existing websocket.
	 * Returns a function that can be called to unsubscribe from the subscription.
	 */
	public static createWebSocketSubscription<T = Record<string, unknown>>(
		props: WebSocketSubscriptionProps<T>
	): { unsubscribe: () => void } {
		const { wsUrl } = props;

		const doesWebSocketForWsUrlExist =
			MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.has(wsUrl);

		if (doesWebSocketForWsUrlExist) {
			return this.handleNewSubForExistingWsUrl<T>(props);
		} else {
			// Create new websocket for new URL or reopen previously closed websocket
			return this.handleNewSubForNewWsUrl<T>(props);
		}
	}

	private static handleNewSubForNewWsUrl<T = Record<string, unknown>>(
		newSubscriptionProps: WebSocketSubscriptionProps<T>
	) {
		const newMWS = new MultiplexWebSocket<T>(
			newSubscriptionProps.wsUrl,
			newSubscriptionProps.enableHeartbeatMonitoring ?? false,
			newSubscriptionProps.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS
		);

		newMWS.subscribe(newSubscriptionProps);

		return {
			unsubscribe: () => {
				newMWS.unsubscribe(newSubscriptionProps.subscriptionId);
			},
		};
	}

	private static handleNewSubForExistingWsUrl<T = Record<string, unknown>>(
		newSubscriptionProps: WebSocketSubscriptionProps<T>
	) {
		const { wsUrl, subscriptionId } = newSubscriptionProps;

		if (!MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.has(wsUrl)) {
			throw new Error(
				`Attempting to subscribe to ${subscriptionId} on websocket ${wsUrl}, but websocket does not exist yet`
			);
		}

		const existingMWS = MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.get(
			wsUrl
		) as MultiplexWebSocket<T>;

		// Check if heartbeat monitoring settings match
		const requestedHeartbeat =
			newSubscriptionProps.enableHeartbeatMonitoring ?? false;
		if (existingMWS.heartbeatMonitoringEnabled !== requestedHeartbeat) {
			logger.warn(
				`WebSocket for ${wsUrl} already exists with heartbeat monitoring ${
					existingMWS.heartbeatMonitoringEnabled ? 'enabled' : 'disabled'
				}, ` +
					`but new subscription requests ${
						requestedHeartbeat ? 'enabled' : 'disabled'
					}. Using existing setting.`
			);
		}

		// Check if heartbeat timeout settings match for the same websocket URL (note that this assumes that all types of subscriptions from the same websocket URL are expected to have the same heartbeat interval)
		const requestedTimeout =
			newSubscriptionProps.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
		if (existingMWS.heartbeatTimeoutMs !== requestedTimeout) {
			logger.warn(
				`WebSocket for ${wsUrl} already exists with heartbeat timeout ${existingMWS.heartbeatTimeoutMs}ms, ` +
					`but new subscription requests ${requestedTimeout}ms. Using existing setting.`
			);
		}

		// Track new subscription for existing websocket
		existingMWS.subscribe(newSubscriptionProps);

		return {
			unsubscribe: () => {
				existingMWS.unsubscribe(newSubscriptionProps.subscriptionId);
			},
		};
	}

	get webSocket() {
		return this.#webSocket;
	}

	/**
	 * Setting the WebSocket instance will automatically add event handlers to the WebSocket instance.
	 * When the WebSocket is connected, all existing subscriptions will be subscribed to.
	 */
	set webSocket(webSocket: WebSocket) {
		webSocket.onopen = () => {
			this.customConnectionState = WebSocketConnectionState.CONNECTED;
			this.reconnectionManager.reset(); // Reset reconnection attempts on successful connection

			// Start heartbeat monitoring if enabled
			if (this.heartbeatMonitoringEnabled) {
				this.startHeartbeatMonitoring();
			}

			// sends subscription message for each subscription for those that are added before the websocket is connected
			for (const [subscriptionId] of this.subscriptions.entries()) {
				this.subscribeToWebSocket(subscriptionId);
			}
		};

		webSocket.onmessage = (messageEvent: MessageEvent) => {
			const message = JSON.parse(
				messageEvent.data as string
			) as WebSocketMessage<T>;

			// Check for heartbeat message from server (only if heartbeat monitoring is enabled)
			if (this.heartbeatMonitoringEnabled && this.isHeartbeatMessage(message)) {
				this.handleHeartbeat(message);
				return; // Don't forward heartbeat messages to subscriptions
			}

			this.subject.next(message);
		};

		webSocket.onclose = (event) => {
			this.customConnectionState = WebSocketConnectionState.DISCONNECTED;

			// Stop heartbeat monitoring when connection closes (if enabled)
			if (this.heartbeatMonitoringEnabled) {
				this.stopHeartbeatMonitoring();
			}

			// Restart websocket if it was closed unexpectedly (not by us)
			if (!event.wasClean && this.subscriptions.size > 0) {
				logger.info('WebSocket closed unexpectedly, restarting...', event);
				this.refreshWebSocket();
			}
		};

		webSocket.onerror = (error) => {
			logger.error('MultiplexWebSocket Error', { error, webSocket });

			// Forward error to all subscriptions for this websocket URL
			const subscriptionIds =
				MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.get(this.wsUrl);
			if (subscriptionIds) {
				for (const subscriptionId of subscriptionIds) {
					const subscription = this.subscriptions.get(subscriptionId);
					if (subscription) {
						subscription.onError(error);
					}
				}
			}

			// Note: onclose always fires after onerror, so reconnection is handled there
			// to avoid double-counting reconnection attempts.
		};

		this.#webSocket = webSocket;
	}

	private subscribeToWebSocket(subscriptionId: SubscriptionId) {
		const subscriptionState = this.subscriptions.get(subscriptionId);

		const {
			subscribeMessage,
			onError,
			onMessage,
			messageFilter,
			errorMessageFilter,
			onClose,
		} = subscriptionState!;

		this.webSocket.send(subscribeMessage);
		if (subscriptionState) {
			subscriptionState.hasSentSubscribeMessage = true;
		}

		// Create internal subscription for message handling
		const subjectSubscription = this.subject
			.pipe(
				catchError((err) => {
					logger.error('Caught websocket error', err);
					onError();
					return [];
				})
			)
			.subscribe({
				next: (message: WebSocketMessage<T>) => {
					try {
						if (messageFilter && !messageFilter(message)) return;

						if (errorMessageFilter && errorMessageFilter(message)) {
							onError();
							return;
						}

						onMessage(message);
					} catch (err) {
						logger.error('Error parsing websocket message', err);
						onError();
					}
				},
				error: (err) => {
					logger.error('Error subscribing to websocket', err);
					onError();
				},
				complete: () => {
					if (onClose) {
						onClose();
					}
				},
			});

		subscriptionState!.subjectSubscription = subjectSubscription;
	}

	private subscribe(props: WebSocketSubscriptionProps<T>) {
		const {
			subscriptionId,
			subscribeMessage,
			unsubscribeMessage,
			onError,
			onMessage,
			messageFilter,
			errorMessageFilter,
			onClose,
		} = props;

		if (this.subscriptions.get(subscriptionId)) {
			throw new Error(
				`Attempting to subscribe to ${subscriptionId} on websocket ${this.wsUrl}, but subscription already exists`
			);
		}

		// Cancel any pending delayed close since we're adding a new subscription
		this.cancelDelayedClose();

		this.subscriptions.set(subscriptionId, {
			subscribeMessage,
			unsubscribeMessage,
			onError,
			onMessage,
			messageFilter,
			errorMessageFilter,
			onClose,
			hasSentSubscribeMessage: false,
		});

		// Update URL to subscription IDs lookup
		if (!MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.has(this.wsUrl)) {
			MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.set(
				this.wsUrl,
				new Set()
			);
		}
		MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.get(this.wsUrl)!.add(
			subscriptionId
		);

		if (this.customConnectionState === WebSocketConnectionState.CONNECTED) {
			this.subscribeToWebSocket(subscriptionId);
		} else if (
			this.customConnectionState === WebSocketConnectionState.CONNECTING
		) {
			// do nothing, subscription will automatically start when websocket is connected
		} else {
			// handle case where websocket is disconnecting/disconnected
			this.refreshWebSocket();
		}
	}

	private unsubscribe(subscriptionId: SubscriptionId) {
		const subscriptionState = this.subscriptions.get(subscriptionId);
		if (subscriptionState) {
			subscriptionState.subjectSubscription?.unsubscribe();

			// Only send unsubscribe message if websocket is connected and ready to send.
			//// Otherwise, when the websocket DOES connect we don't have to worry about this subscription because we are deleting it from the subscriptions map. (Which only trigger their connections once the websocket becomes connected)
			if (
				this.customConnectionState === WebSocketConnectionState.CONNECTED &&
				this.webSocket.readyState === WebSocket.OPEN
			) {
				this.webSocket.send(subscriptionState.unsubscribeMessage);
			}

			this.subscriptions.delete(subscriptionId);

			// Update URL to subscription IDs lookup
			const subscriptionIds =
				MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.get(this.wsUrl);
			if (subscriptionIds) {
				subscriptionIds.delete(subscriptionId);
				if (subscriptionIds.size === 0) {
					MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.delete(this.wsUrl);
					// Schedule delayed close when last subscriber unsubscribes
					this.scheduleDelayedClose();
				}
			}
		}
	}

	private scheduleDelayedClose() {
		// Cancel any existing delayed close timeout
		this.cancelDelayedClose();

		// Schedule new delayed close
		this.closeTimeout = setTimeout(() => {
			this.close();
		}, DEFAULT_CONNECTION_CLOSE_DELAY_MS);
	}

	private cancelDelayedClose() {
		if (this.closeTimeout) {
			clearTimeout(this.closeTimeout);
			this.closeTimeout = null;
		}
	}

	private close() {
		// Cancel any pending delayed close
		this.cancelDelayedClose();

		// Stop heartbeat monitoring (if enabled)
		if (this.heartbeatMonitoringEnabled) {
			this.stopHeartbeatMonitoring();
		}

		for (const [subscriptionId] of this.subscriptions.entries()) {
			this.unsubscribe(subscriptionId);
		}

		this.subscriptions.clear();
		this.webSocket.close();
		MultiplexWebSocket.URL_TO_WEBSOCKETS_LOOKUP.delete(this.wsUrl);
		MultiplexWebSocket.URL_TO_SUBSCRIPTION_IDS_LOOKUP.delete(this.wsUrl);
		this.reconnectionManager.reset();
	}

	private startHeartbeatMonitoring() {
		// Start the heartbeat timeout - if we don't receive a heartbeat message within the timeout, refresh connection
		this.resetHeartbeatTimeout();
	}

	private stopHeartbeatMonitoring() {
		if (this.heartbeatTimeout) {
			clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}
	}

	private resetHeartbeatTimeout() {
		// Clear existing timeout
		if (this.heartbeatTimeout) {
			clearTimeout(this.heartbeatTimeout);
		}

		// Set new timeout
		this.heartbeatTimeout = setTimeout(() => {
			logger.warn(
				`No heartbeat received within ${this.heartbeatTimeoutMs}ms - connection appears dead`
			);
			this.refreshWebSocket();
		}, this.heartbeatTimeoutMs);
	}

	private isHeartbeatMessage(message: WebSocketMessage<T>): boolean {
		// Check if message is a heartbeat message from server
		return (message as any)?.channel === 'heartbeat';
	}

	private handleHeartbeat(_message: WebSocketMessage<T>) {
		// Reset the heartbeat timeout
		this.resetHeartbeatTimeout();
	}

	private refreshWebSocket() {
		// Cancel any pending delayed close since we're refreshing
		this.cancelDelayedClose();

		// Reset heartbeat monitoring during refresh (if enabled) - it will restart when the new connection opens
		if (this.heartbeatMonitoringEnabled) {
			this.stopHeartbeatMonitoring();
		}

		let shouldReconnect: boolean;
		let delay: number;

		try {
			({ shouldReconnect, delay } =
				this.reconnectionManager.attemptReconnection(this.wsUrl));
		} catch (error) {
			// Max reconnect attempts exceeded — close gracefully and notify all subscribers
			logger.error('WebSocket reconnection failed', error);

			// Forward error to all subscriptions before closing
			for (const [, subscription] of this.subscriptions.entries()) {
				subscription.onError(error);
			}

			this.close();
			return;
		}

		if (!shouldReconnect) {
			return;
		}

		// Clean up current websocket
		const currentWebSocket = this.webSocket;
		if (currentWebSocket) {
			currentWebSocket.onerror = () => {};
			currentWebSocket.onclose = () => {};
			currentWebSocket.onmessage = () => {};
			currentWebSocket.onopen = () => {
				// in the event where the websocket has yet to connect, we close the connection after it is connected
				currentWebSocket.close();
			};
			currentWebSocket.close();
		}

		// Reset subscription states
		this.subscriptions.forEach((subscription) => {
			subscription.hasSentSubscribeMessage = false;
		});

		// Use exponential backoff before attempting to reconnect
		setTimeout(() => {
			this.webSocket = new WebSocket(this.wsUrl);
		}, delay);
	}
}

import { CandleResolution } from '@velocity-exchange/sdk';
import { EnvironmentConstants } from '../EnvironmentConstants';
import { JsonCandle, JsonTrade, MarketSymbol, UIEnv } from '../types';
import { Observable, Subject } from 'rxjs';
import { MultiplexWebSocket } from '../utils/MultiplexWebSocket';
import { logger } from '../utils/logger';

const getBaseDataApiUrl = (env: UIEnv) => {
	const constantEnv: keyof typeof EnvironmentConstants.dataServerUrl =
		env.isStaging ? 'staging' : env.isDevnet ? 'dev' : 'mainnet';
	const dataApiUrl = EnvironmentConstants.dataServerUrl[constantEnv];
	return dataApiUrl.replace('https://', '');
};

// Used by the subscriber client to subscribe to the candles websocket endpoint
type DataApiWsSubscriptionConfig = {
	resolution: CandleResolution;
	marketSymbol: MarketSymbol;
	env: UIEnv;
};

const getWsSubscriptionPath = (config: DataApiWsSubscriptionConfig) => {
	const baseDataApiUrl = getBaseDataApiUrl(config.env);
	return `wss://${baseDataApiUrl}/ws`;
};

const getWsSubscriptionMessage = (config: DataApiWsSubscriptionConfig) => {
	return JSON.stringify({
		type: 'subscribe',
		symbol: config.marketSymbol,
		resolution: `${config.resolution}`,
	});
};

type WsSubscriptionMessageType =
	| 'subscribe'
	| 'init'
	| 'subscription'
	| 'update'
	| 'create';

type DataApiCandleProps = {
	resolution: string;
	symbol: string;
}; // There is other stuff in the candle objects but we only care about these properties

type WsSubscriptionMessage<T extends WsSubscriptionMessageType> = {
	type: T;
	candle: DataApiCandleProps;
}; // There are more params in the various messages we can receive but we only care about these properties

type WsUpdateMessage = WsSubscriptionMessage<'update'> & {
	candle: JsonCandle;
	trades: JsonTrade[];
};

export class DataApiWsClient {
	public readonly config: DataApiWsSubscriptionConfig;
	private readonly candleSubject: Subject<JsonCandle>;
	private readonly tradesSubject: Subject<JsonTrade[]>;
	private readonly _candleObservable: Observable<JsonCandle>;
	private readonly _tradesObservable: Observable<JsonTrade[]>;
	private multiplexSubscription: { unsubscribe: () => void } | null = null;

	constructor(config: DataApiWsSubscriptionConfig) {
		this.config = config;
		this.candleSubject = new Subject<JsonCandle>();
		this.tradesSubject = new Subject<JsonTrade[]>();
		this._candleObservable = this.candleSubject.asObservable();
		this._tradesObservable = this.tradesSubject.asObservable();
	}

	private handleWsMessage = (
		message: WsSubscriptionMessage<WsSubscriptionMessageType>
	) => {
		switch (message.type) {
			case 'update':
				{
					const candle = (message as WsUpdateMessage).candle;
					const trades = (message as WsUpdateMessage).trades;
					if (candle) this.candleSubject.next(candle);
					if (trades) this.tradesSubject.next(trades);
				}
				break;
			default:
				break;
		}
	};

	private handleError = () => {
		logger.error('candlesv2:: dataApiWsClient error occurred');
	};

	private handleClose = () => {
		logger.info('candlesv2:: dataApiWsClient connection closed');
	};

	public subscribe = async () => {
		const subscriptionId = `${this.config.marketSymbol}-${this.config.resolution}`;

		this.multiplexSubscription = MultiplexWebSocket.createWebSocketSubscription<
			WsSubscriptionMessage<WsSubscriptionMessageType>
		>({
			wsUrl: getWsSubscriptionPath(this.config),
			subscriptionId,
			subscribeMessage: getWsSubscriptionMessage(this.config),
			unsubscribeMessage: JSON.stringify({
				type: 'unsubscribe',
				symbol: this.config.marketSymbol,
				resolution: `${this.config.resolution}`,
			}),
			onError: this.handleError,
			onMessage: this.handleWsMessage,
			onClose: this.handleClose,
			messageFilter: (message) => {
				try {
					// Only accept `update` messages with a matching resolution and symbol for this subscription
					if (
						message?.type === 'update' &&
						message.candle?.resolution === this.config.resolution &&
						message.candle?.symbol === this.config.marketSymbol
					) {
						return true;
					}

					return false;
				} catch (error) {
					logger.error('candlesv2:: dataApiWsClient messageFilter error', {
						error,
						message,
					});

					return false;
				}
			},
			errorMessageFilter: (_message) => {
				return false; // No known error messages
			},
		});

		return Promise.resolve();
	};

	public unsubscribe = () => {
		if (this.multiplexSubscription) {
			this.multiplexSubscription.unsubscribe();
			this.multiplexSubscription = null;
		}
		this.candleSubject.complete();
		this.tradesSubject.complete();
	};

	/**
	 * Get the candle updates stream
	 * @returns An observable that emits candle updates
	 */
	public get candlesObservable(): Observable<JsonCandle> {
		return this._candleObservable;
	}

	/**
	 * Get the trade updates stream
	 * @returns An observable that emits trade updates
	 */
	public get tradesObservable(): Observable<JsonTrade[]> {
		return this._tradesObservable;
	}
}

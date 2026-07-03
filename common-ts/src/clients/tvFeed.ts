import {
	CandleResolution,
	VelocityClient,
	PerpMarketConfig,
	PRICE_PRECISION_EXP,
	SpotMarketConfig,
} from '@velocity-exchange/sdk';
import { CandleType, JsonCandle, JsonTrade, MarketId } from '../types';
import { UIEnv } from '../types/UIEnv';
import { Candle } from '../utils/candles/Candle';
import { PollingSequenceGuard } from '../utils/pollingSequenceGuard';
import { CandleClient, CandleClientConfig } from './candleClient';
import { getBaseAssetSymbol } from '../utils/markets/config';

const VELOCITY_V2_START_TS = 1668470400; // 15th November 2022 ... 2022-11-15T00:00:00.000Z

type MarketDecimalConfig = Record<string, number>;

const resolutions = [
	'1',
	'3',
	'5',
	'15',
	'30',
	'60',
	'240',
	'6H',
	'8H',
	'1D',
	'3D',
	'1W',
	'1M',
];

const tvResolutionStringToStandardResolutionString = (
	tvResolutionString: string
): CandleResolution => {
	switch (tvResolutionString) {
		case '1':
			return '1';
		case '5':
			return '5';
		case '15':
			return '15';
		case '60':
			return '60';
		case '240':
			return '240';
		case 'D':
		case '1D':
			return 'D';
		case 'W':
		case '1W':
			return 'W';
		case 'M':
		case '1M':
			return 'M';
		default:
			return tvResolutionString as CandleResolution;
	}
};

type TVMarketInfo = {
	symbol: string;
	full_name: string;
	description: string;
	exchange: string;
	ticker: string;
	type: string;
};

const DATAFEED_CONFIG: {
	exchanges: string[];
	supported_resolutions: string[];
	currency_codes: string[];
	supports_marks: boolean;
	supports_time: boolean;
	supports_timescale_marks: boolean;
	symbols_types: string[];
} = {
	exchanges: [],
	supported_resolutions: [...resolutions],
	currency_codes: [],
	supports_marks: true,
	supports_time: false,
	supports_timescale_marks: false,
	symbols_types: [],
};

type TVBar = {
	/** Bar time.
	 * Amount of **milliseconds** since Unix epoch start in **UTC** timezone.
	 * `time` for daily, weekly, and monthly bars is expected to be a trading day (not session start day) at 00:00 UTC.
	 * The library adjusts time according to `session` from {@link LibrarySymbolInfo}.
	 */
	time: number;
	/** Opening price */
	open: number;
	/** High price */
	high: number;
	/** Low price */
	low: number;
	/** Closing price */
	close: number;
	/** Trading Volume */
	volume?: number;
};

const findMarketBySymbol = (
	symbol: string,
	perpMarketConfigs: PerpMarketConfig[],
	spotMarketConfigs: SpotMarketConfig[]
):
	| {
			type: 'perp';
			config: PerpMarketConfig;
	  }
	| {
			type: 'spot';
			config: SpotMarketConfig;
	  } => {
	if (!symbol) {
		throw new Error(`TVFeed::No symbol provided`);
	}

	const sanitisedSymbol = symbol.toLowerCase().replace('/usdt', ''); // Lowercase and replace /usdt (for spot markets) to santise symbol for lookup

	const isPerp = sanitisedSymbol.toLowerCase().includes('perp');

	const matchingMarketConfig = isPerp
		? perpMarketConfigs.find((mkt) =>
				mkt.symbol.toLowerCase().includes(sanitisedSymbol.toLowerCase())
		  )
		: spotMarketConfigs.find((mkt) =>
				mkt.symbol.toLowerCase().includes(sanitisedSymbol.toLowerCase())
		  );

	if (!matchingMarketConfig) {
		throw new Error(`TVFeed::No market found for symbol ${symbol}`);
	}

	if (isPerp) {
		return {
			type: 'perp',
			config: matchingMarketConfig as PerpMarketConfig,
		};
	}

	return {
		type: 'spot',
		config: matchingMarketConfig as SpotMarketConfig,
	};
};

const candleFetchingPollKey = Symbol('candleFetchingPollKey');

const candleToTvBar = (candle: JsonCandle, candleType: CandleType): TVBar => {
	const useOraclePrice = candleType === CandleType.ORACLE_PRICE;

	return {
		time: candle.ts * 1000,
		open: useOraclePrice ? candle.oracleOpen : candle.fillOpen,
		high: useOraclePrice ? candle.oracleHigh : candle.fillHigh,
		low: useOraclePrice ? candle.oracleLow : candle.fillLow,
		close: useOraclePrice ? candle.oracleClose : candle.fillClose,
		volume: candle.quoteVolume,
	};
};

const PerpMarketConfigToTVMarketInfo = (
	marketConfig: PerpMarketConfig
): TVMarketInfo => {
	return {
		symbol: marketConfig.symbol,
		full_name: marketConfig.fullName ?? marketConfig.symbol,
		description: marketConfig.fullName ?? marketConfig.symbol,
		exchange: 'Velocity',
		ticker: marketConfig.symbol,
		type: 'crypto',
	};
};

const SpotMarketConfigToTVMarketInfo = (
	marketConfig: SpotMarketConfig
): TVMarketInfo => {
	return {
		symbol: marketConfig.symbol,
		full_name: marketConfig.symbol,
		description: marketConfig.symbol,
		exchange: 'Velocity',
		ticker: marketConfig.symbol,
		type: 'crypto',
	};
};

interface TvAppTradeDataManager {
	getFilledOrdersData(startDate: number, endDate: number): Promise<JsonTrade[]>;
	getCurrentSubAccountAddress(): string | null;
}

export class VelocityTvFeed {
	private env: UIEnv;
	private candleType: CandleType;
	private candleClient: CandleClient;
	private velocityClient: VelocityClient;
	private onResetCache!: () => void;
	private perpMarketConfigs: PerpMarketConfig[];
	private spotMarketConfigs: SpotMarketConfig[];
	private positiveColor: string;
	private negativeColor: string;
	private buySellMarkStrokeColor: string;
	private tvAppTradeDataManager: TvAppTradeDataManager | undefined;
	private marketDecimalConfig: MarketDecimalConfig | undefined;

	constructor(
		env: UIEnv,
		candleType: CandleType,
		velocityClient: VelocityClient,
		perpMarketConfigs: PerpMarketConfig[],
		spotMarketConfigs: SpotMarketConfig[],
		positiveColor: string,
		negativeColor: string,
		buySellMarkStrokeColor: string,
		tvAppTradeDataManager?: TvAppTradeDataManager,
		marketDecimalConfig?: MarketDecimalConfig,
		candleClientConfig?: CandleClientConfig
	) {
		this.env = env;
		this.candleType = candleType;
		this.candleClient = new CandleClient(candleClientConfig);
		this.velocityClient = velocityClient;
		this.perpMarketConfigs = perpMarketConfigs;
		this.spotMarketConfigs = spotMarketConfigs;
		this.positiveColor = positiveColor;
		this.negativeColor = negativeColor;
		this.buySellMarkStrokeColor = buySellMarkStrokeColor;
		this.tvAppTradeDataManager = tvAppTradeDataManager;
		this.marketDecimalConfig = marketDecimalConfig;
	}

	public resetCache() {
		this.onResetCache?.();
	}

	private searchMarkets = (symbol: string): TVMarketInfo[] => {
		const res: Pick<
			TVMarketInfo,
			'symbol' | 'ticker' | 'full_name' | 'description'
		>[] = [];

		const currentPerpMarkets = this.perpMarketConfigs;
		const currentSpotMarkets = this.spotMarketConfigs;

		if (!symbol) {
			res.push(PerpMarketConfigToTVMarketInfo(currentPerpMarkets[0]));
		} else {
			for (const market of currentPerpMarkets) {
				const lowerCaseMarket = market.symbol.toLowerCase();
				if (lowerCaseMarket.includes(symbol.toLowerCase())) {
					res.push(PerpMarketConfigToTVMarketInfo(market));
				}
			}

			for (const market of currentSpotMarkets) {
				const lowerCaseMarket = market.symbol.toLowerCase();
				if (lowerCaseMarket.includes(symbol.toLowerCase())) {
					res.push(SpotMarketConfigToTVMarketInfo(market));
				}
			}
		}

		return res.map((mkt) => {
			return {
				...mkt,
				exchange: 'Velocity',
				type: 'crypto',
			};
		});
	};

	// IExternalDatafeed implementation
	onReady(callback: (config: typeof DATAFEED_CONFIG) => void) {
		// using setTimeout because tradingview wants this to resolve asynchronously
		setTimeout(() => callback(DATAFEED_CONFIG), 0);
	}

	// IDatafeedChartApi implementation
	searchSymbols(
		userInput: string,
		_exchange: string,
		_symbolType: string,
		onResult: (results: TVMarketInfo[]) => void
	): void {
		if (!userInput) return onResult([]);

		const res = this.searchMarkets(userInput);

		onResult(res);
	}

	resolveSymbol(
		symbolName: string,
		onResolve: (symbolInfo: Record<string, unknown>) => void,
		onError: (reason: string) => void
	): void {
		const targetMarket = findMarketBySymbol(
			symbolName,
			this.perpMarketConfigs,
			this.spotMarketConfigs
		);

		if (targetMarket) {
			const tvMarketName = targetMarket.config.symbol;

			// Use market-specific decimal precision from configuration
			const baseAssetSymbol = getBaseAssetSymbol(symbolName);
			const marketDecimals = this.marketDecimalConfig?.[baseAssetSymbol];

			let priceScale: number;

			if (marketDecimals !== undefined) {
				// Use configured market decimals
				priceScale = 10 ** marketDecimals;
			} else {
				// Fall back to original tick size calculation
				let tickSize: number;

				if (targetMarket.type === 'perp') {
					tickSize = this.velocityClient
						.getPerpMarketAccountOrThrow(targetMarket.config.marketIndex)
						.orderTickSize.toNumber();
				} else {
					tickSize = this.velocityClient
						.getSpotMarketAccountOrThrow(targetMarket.config.marketIndex)
						.orderTickSize.toNumber();
				}

				const pricePrecisionExp = PRICE_PRECISION_EXP.toNumber();
				const tickSizeExp = Math.ceil(Math.log10(tickSize));
				const priceScaleExponent = Math.max(0, pricePrecisionExp - tickSizeExp);
				priceScale = 10 ** priceScaleExponent;
			}

			onResolve({
				name: tvMarketName,
				full_name: tvMarketName,
				description: tvMarketName,
				exchange: 'Velocity',
				ticker: targetMarket.config.symbol,
				type: 'crypto',
				session: '24x7',
				timezone: 'Etc/UTC',
				listed_exchange: 'Velocity',
				format: 'price',
				pricescale: priceScale,
				minmov: 1,
				supported_resolutions: [...resolutions],
				has_intraday: true,
				intraday_multipliers: ['1', '5', '15', '60', '240'],
			});

			return;
		}

		onError(`Couldn't find market for symbol ${symbolName}`);
	}

	/**
	 * TradingView sometimes asks for a FROM timestamp halfway between two candles, this isn't compatible with the new candles API so we round these down the nearest candle - which should be the exact same candle!!
	 * @param timestamp
	 * @param resolution
	 * @returns
	 */
	private roundFromTimestampToExactCandleTs = (
		timestamp: number,
		resolution: CandleResolution
	) => {
		const timestampMs = timestamp * 1000;
		const candleLengthMs = Candle.resolutionStringToCandleLengthMs(resolution);

		const remainderMs = timestampMs % candleLengthMs;

		if (remainderMs === 0) {
			return timestamp;
		}

		const roundedDownTimestampMs = timestampMs - remainderMs;

		const roundedTimestampMs = roundedDownTimestampMs + candleLengthMs;

		return roundedTimestampMs / 1000;
	};

	private formatTVRequestedRange = (
		fromTs: number,
		toTs: number,
		resolution: CandleResolution
	) => {
		const formattedFromTs = this.roundFromTimestampToExactCandleTs(
			fromTs,
			resolution
		); // TradingView sometimes asks for a FROM timestamp halfway between two candles, so we round down to the nearest candle

		const formattedToTs = Math.floor(Math.min(toTs, Date.now() / 1000)); // TradingView sometimes asks for a TO timestamp in the future, so we cap it at the current timestamp

		return {
			from: formattedFromTs,
			to: formattedToTs,
		};
	};
	// Helper function to convert resolution string to seconds
	private getResolutionInSeconds(resolution: string): number {
		// Resolution can be: '1', '3', '5', '15', '30', '60', '120', '240', '1D', '1W', etc.
		if (resolution.includes('D')) {
			const days = parseInt(resolution);
			return days * 24 * 60 * 60;
		}
		if (resolution.includes('W')) {
			const weeks = parseInt(resolution);
			return weeks * 7 * 24 * 60 * 60;
		}
		if (resolution.includes('M')) {
			const months = parseInt(resolution);
			return months * 30 * 24 * 60 * 60; // Approximate
		}
		// Default: minutes
		const minutes = parseInt(resolution);
		return minutes * 60;
	}

	// https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.Mark/ reference for marks type
	async getMarks(
		_symbolInfo: unknown,
		startDate: number,
		endDate: number,
		onDataCallback: (marks: unknown[]) => void,
		_resolution: string
	) {
		if (!this.tvAppTradeDataManager) {
			return;
		}
		const orderHistory = await this.tvAppTradeDataManager.getFilledOrdersData(
			startDate,
			endDate
		);

		const currentUserAccount =
			this.tvAppTradeDataManager.getCurrentSubAccountAddress();

		// Calculate resolution in seconds for aligning marks to candle start times
		const resolutionInSeconds = this.getResolutionInSeconds(_resolution);

		const tradeMarks = orderHistory.map((trade) => {
			const currentUserIsMaker = trade.maker === currentUserAccount;
			const currentUserIsTaker = trade.taker === currentUserAccount;

			let isLong: boolean = false;
			if (currentUserIsMaker) {
				isLong = trade.makerOrderDirection === 'long';
			} else if (currentUserIsTaker) {
				isLong = trade.takerOrderDirection === 'long';
			}

			const color = isLong ? this.positiveColor : this.negativeColor;
			const baseAmount = Number(trade.baseAssetAmountFilled);
			const quoteAmount = Number(trade.quoteAssetAmountFilled);
			const avgPrice = quoteAmount / baseAmount;

			const formatPrice = (price: number): string => {
				if (price >= 1) {
					return price.toLocaleString('en-US', {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					});
				} else {
					if (price === 0) return '0.0000';
					if (price < 0.00001) return '<0.00001';
					return price.toFixed(4);
				}
			};

			// Align trade time to candle start time
			// TradingView requires mark time to exactly match a bar time
			const candleStartTime =
				Math.floor(trade.ts / resolutionInSeconds) * resolutionInSeconds;

			return {
				id: trade.txSig,
				time: candleStartTime,
				color: {
					background: color,
					border: this.buySellMarkStrokeColor,
				},
				borderWidth: 1,
				hoveredBorderWidth: 1,
				text: `${isLong ? 'Long' : 'Short'} at $${formatPrice(avgPrice)}`,
				label: isLong ? 'B' : 'S',
				labelFontColor: this.buySellMarkStrokeColor,
				minSize: 16,
			};
		});

		onDataCallback(tradeMarks);
	}

	async getBars(
		symbolInfo: {
			name: string;
			ticker?: string;
		},
		resolution: string,
		periodParams: {
			countBack: number;
			from: number;
			to: number;
		},
		onResult: (
			bars: TVBar[],
			meta?: {
				noData: boolean;
			}
		) => void,
		_onError: (reason: string) => void
	) {
		// Can automatically return no data if the requested range is before the Velocity V2 launch
		if (periodParams.to < VELOCITY_V2_START_TS) {
			onResult([], {
				noData: true,
			});
			return;
		}

		const symbolToUse = symbolInfo.ticker ?? symbolInfo.name;

		const targetResolution =
			tvResolutionStringToStandardResolutionString(resolution);
		const targetMarket = findMarketBySymbol(
			symbolToUse,
			this.perpMarketConfigs,
			this.spotMarketConfigs
		);
		const targetMarketId =
			targetMarket.type === 'perp'
				? MarketId.createPerpMarket(targetMarket.config.marketIndex)
				: MarketId.createSpotMarket(targetMarket.config.marketIndex);

		const fetchCandles = async () => {
			const formattedTsRange = this.formatTVRequestedRange(
				periodParams.from,
				periodParams.to,
				targetResolution
			);

			const candles = await this.candleClient.fetch({
				env: this.env,
				marketId: targetMarketId,
				resolution: targetResolution,
				fromTs: formattedTsRange.from,
				toTs: formattedTsRange.to,
			});
			return candles;
		};

		const candlesResult = await PollingSequenceGuard.fetch(
			candleFetchingPollKey,
			fetchCandles
		);

		if (candlesResult.length === 0) {
			onResult([], {
				noData: true,
			});
			return;
		}

		const bars = candlesResult.map((candle) =>
			candleToTvBar(candle, this.candleType)
		);

		onResult(bars, {
			noData: false,
		});

		return;
	}

	async subscribeBars(
		symbolInfo: { ticker: string },
		resolution: string,
		onTick: (bar: TVBar) => void,
		subscriberGuid: string,
		onResetCache: () => void
	) {
		this.onResetCache = onResetCache;

		const targetResolution =
			tvResolutionStringToStandardResolutionString(resolution);
		const targetMarket = findMarketBySymbol(
			symbolInfo.ticker,
			this.perpMarketConfigs,
			this.spotMarketConfigs
		);
		const targetMarketId =
			targetMarket.type === 'perp'
				? MarketId.createPerpMarket(targetMarket.config.marketIndex)
				: MarketId.createSpotMarket(targetMarket.config.marketIndex);

		// First create the subscription and wait for it to be ready
		await this.candleClient.subscribe(
			{
				resolution: targetResolution,
				marketId: targetMarketId,
				env: this.env,
			},
			subscriberGuid
		);

		// Then set up the event listener once the eventBus exists
		this.candleClient.on(subscriberGuid, 'candle-update', (newCandle) => {
			const newBar = candleToTvBar(newCandle, this.candleType);

			onTick(newBar);
		});
	}

	unsubscribeBars(listenerGuid: string): void {
		this.candleClient.unsubscribe(listenerGuid);
	}
}

import {
	MarketType,
	OracleSource,
	PerpMarketConfig,
	PerpMarkets,
	SpotMarkets,
	SpotMarketConfig,
	BASE_PRECISION,
	BASE_PRECISION_EXP,
} from '@velocity-exchange/sdk';
import { MarketId } from './MarketId';
import invariant from 'tiny-invariant';
import {
	EXPONENT_POOL_ID,
	JLP_POOL_ID,
	LST_POOL_ID,
	MAIN_POOL_ID,
	SACRED_POOL_ID,
} from '../constants/pools';
import { USDT_SPOT_MARKET_INDEX } from '../constants/markets';
import { ENUM_UTILS } from '../utils/enum';
import { Config } from '../Config';
import { Opaque } from './utility';

const useAsyncMarketConfigs =
	process.env.NEXT_PUBLIC_USE_ASYNC_MARKET_CONFIGS === 'true';

/**
 * MarketSymbol will uniquely identify a market
 */
export type MarketSymbol = Opaque<string, 'MarketSymbol'>;
/**
 * MarketDisplaySymbol is the label for a market that we display to a user
 */
export type MarketDisplaySymbol = Opaque<string, 'MarketDisplaySymbol'>;
/**
 * BaseAssetSymbol is the symbol for the underlying asset for a market
 */
export type BaseAssetSymbol = Opaque<string, 'BaseAssetSymbol'>;
/**
 * BaseAssetDisplaySymbol is the label for the underlying asset for a market that we display to a user
 */
export type BaseAssetDisplaySymbol = Opaque<string, 'BaseAssetDisplaySymbol'>;

/**
 * # Examples and explanations of the symbol types:
 *
 * ## MarketSymbol:
 * These are basically just the raw symbols in the market configs.
 * - 1KWEN-PERP
 * - JitoSOL-3
 * - PT-fragSOL-15JUN25-3
 *
 * ## MarketDisplaySymbol:
 * This is the symbol we use to display the market to the user. For SPOT markets it should be the exact same as the BaseAssetDisplaySymbol, but for PERP markets they might be different which is why we have this separate type.
 *
 * - 1KWEN-PERP => 1KWEN-PERP
 * - JitoSOL-3 => JitoSOL
 * - PT-fragSOL-15JUN25-3 => PT-fragSOL-15JUN25
 *
 * ## BaseAssetDisplaySymbol:
 * This is the symbol we use to communicate "what asset they are holding". For SPOT markets it should be the same as the MarketDisplaySymbol, but for PERP markets it may be different, for example we show open interest denominated in "1KWEN", while the market is "1KWEN-PERP".
 *
 * - 1KWEN-PERP => 1KWEN
 * - JitoSOL-3 => JitoSOL
 * - PT-fragSOL-15JUN25-3 => fragSOL
 *
 * ## BaseAssetSymbol:
 * This is the symbol for the underlying asset for a market. I don't believe we will display this anywhere but we use these for example when looking up the market icon to use.
 *
 * - 1KWEN-PERP => WEN
 * - JitoSOL-3 => JitoSOL
 * - PT-fragSOL-15JUN25-3 => PT-fragSOL-15JUN25 (note: PT-fragSOL has an icon different to regular fragSOL, otherwise we would use 'fragSOL' for the base asset symbol)
 */

type UISymbols = {
	marketSymbol: MarketSymbol;
	marketDisplaySymbol: MarketDisplaySymbol;
	baseAssetSymbol: BaseAssetSymbol;
	baseAssetDisplaySymbol: BaseAssetDisplaySymbol;
};

export class UIMarket {
	static perpMarkets = PerpMarkets['mainnet-beta'];
	static spotMarkets = SpotMarkets['mainnet-beta'];
	private static cache = new Map<string, UIMarket>();

	readonly market: SpotMarketConfig | PerpMarketConfig;
	readonly marketId: MarketId;

	private _uiSymbols!: UISymbols;

	get uiSymbols() {
		return this._uiSymbols;
	}

	private set uiSymbols(uiSymbols: UISymbols) {
		this._uiSymbols = uiSymbols;
	}

	constructor(readonly marketIndex: number, readonly marketType: MarketType) {
		const marketId = new MarketId(marketIndex, marketType);
		const perpMarkets = useAsyncMarketConfigs
			? UIMarket.perpMarkets
			: Config.perpMarketsLookup;
		const spotMarkets = useAsyncMarketConfigs
			? UIMarket.spotMarkets
			: Config.spotMarketsLookup;
		const markets = marketId.isPerp ? perpMarkets : spotMarkets;

		//@ts-ignore
		const market = markets.find((m) => m.marketIndex === marketIndex);

		invariant(
			market,
			`Market not found for type: ${marketId.marketTypeStr}, market index: ${marketIndex}`
		);

		this.marketId = marketId;
		this.market = market;

		this.setUiSymbols();
	}

	static setPerpMarkets(perpMarkets: PerpMarketConfig[]) {
		this.perpMarkets = perpMarkets;
	}

	static setSpotMarkets(spotMarkets: SpotMarketConfig[]) {
		this.spotMarkets = spotMarkets;
	}

	private static getOrCreate(marketIndex: number, marketType: MarketType) {
		const key = MarketId.key(marketIndex, marketType);
		if (UIMarket.cache.has(key)) {
			return UIMarket.cache.get(key)!;
		}
		const market = new UIMarket(marketIndex, marketType);
		UIMarket.cache.set(key, market);
		return market;
	}

	static createSpotMarket(marketIndex: number) {
		return UIMarket.getOrCreate(marketIndex, MarketType.SPOT);
	}

	static createPerpMarket(marketIndex: number) {
		return UIMarket.getOrCreate(marketIndex, MarketType.PERP);
	}

	static fromMarketId(marketId: MarketId) {
		return UIMarket.getOrCreate(marketId.marketIndex, marketId.marketType);
	}

	get isSpot() {
		return this.marketId.isSpot;
	}

	get isPerp() {
		return this.marketId.isPerp;
	}

	get marketTypeStr() {
		return this.marketId.marketTypeStr;
	}

	get key() {
		return this.marketId.key;
	}

	get isUsdtMarket() {
		return this.isSpot && this.marketIndex === USDT_SPOT_MARKET_INDEX;
	}

	get isStableCoinMarket() {
		return (
			this.isSpot &&
			ENUM_UTILS.match(this.market.oracleSource, OracleSource.PYTH_STABLE_COIN)
		);
	}

	get precision() {
		if (this.marketId.isPerp) {
			return BASE_PRECISION;
		} else {
			return (this.market as SpotMarketConfig).precision;
		}
	}

	get precisionExp() {
		if (this.marketId.isPerp) {
			return BASE_PRECISION_EXP;
		} else {
			return (this.market as SpotMarketConfig).precisionExp;
		}
	}

	equals(other: UIMarket) {
		return this.marketId.equals(other.marketId);
	}

	protected setUiSymbols() {
		invariant(this.marketId, 'MarketId not set');

		const marketSymbol = this.getMarketSymbol();
		const marketDisplaySymbol = this.getMarketDisplaySymbol();
		const baseAssetSymbol = this.getBaseAssetSymbol();
		const baseAssetDisplaySymbol = this.getBaseAssetDisplaySymbol();

		this.uiSymbols = {
			marketSymbol,
			marketDisplaySymbol,
			baseAssetSymbol,
			baseAssetDisplaySymbol,
		};
	}

	private getMarketSymbol(): MarketSymbol {
		return this.market.symbol as MarketSymbol;
	}

	private getMarketDisplaySymbol(): MarketDisplaySymbol {
		if (this.marketId.isPerp) {
			return this.market.symbol as MarketDisplaySymbol;
		} else {
			const marketConfig = this.market as SpotMarketConfig;
			switch (marketConfig.poolId) {
				case MAIN_POOL_ID:
					return marketConfig.symbol as MarketDisplaySymbol;
				case JLP_POOL_ID:
				case LST_POOL_ID:
					return marketConfig.symbol.split('-')[0] as MarketDisplaySymbol;
				case EXPONENT_POOL_ID: {
					/*
					Example market symbol conversions:
					PT-fragSOL-15JUN25-3 => PT-fragSOL-15JUN25
					PT-kySOL-10JUL25-3 => PT-kySOL-10JUL25
					JitoSOL-3 => JitoSOL
					JTO-3 => JTO
				*/
					return (
						marketConfig.symbol.startsWith('PT-')
							? marketConfig.symbol.slice(
									0,
									marketConfig.symbol.lastIndexOf('-')
							  )
							: marketConfig.symbol.split('-')[0]
					) as MarketDisplaySymbol;
				}
				case SACRED_POOL_ID:
					return marketConfig.symbol.split('-')[0] as MarketDisplaySymbol;
				default:
					return marketConfig.symbol as MarketDisplaySymbol;
			}
		}
	}

	private getBaseAssetSymbol(): BaseAssetSymbol {
		if (this.marketId.isPerp) {
			return (this.market as PerpMarketConfig).baseAssetSymbol
				.replace('1K', '')
				.replace('1M', '') as BaseAssetSymbol;
		} else {
			return this.getMarketDisplaySymbol() as unknown as BaseAssetSymbol; // Currently no cases where SPOT baseAssetSymbol is different from marketDisplaySymbol
		}
	}

	private getBaseAssetDisplaySymbol(): BaseAssetDisplaySymbol {
		if (this.marketId.isPerp) {
			return (this.market as PerpMarketConfig)
				.baseAssetSymbol as BaseAssetDisplaySymbol;
		} else {
			const marketConfig = this.market as SpotMarketConfig;
			switch (marketConfig.poolId) {
				case EXPONENT_POOL_ID: {
					/*
					Example market symbol conversions:
					PT-fragSOL-15JUN25-3 => fragSOL
					PT-kySOL-10JUL25-3 => kySOL
					JitoSOL-3 => JitoSOL
					JTO-3 => JTO
				*/
					return (
						marketConfig.symbol.startsWith('PT-')
							? marketConfig.symbol.split('-')[1]
							: marketConfig.symbol.split('-')[0]
					) as BaseAssetDisplaySymbol;
				}
				default:
					return marketConfig.symbol as BaseAssetDisplaySymbol;
			}
		}
	}
}

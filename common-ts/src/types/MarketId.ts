import { MarketType } from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../utils/enum';
import { Opaque } from './utility';

// Define MarketKey as an opaque type
export type MarketKey = Opaque<'MarketKey', string>;

export class MarketId {
	private static cache = new Map<MarketKey, MarketId>();
	private _key: MarketKey;
	private _isSpot: boolean;
	private _isPerp: boolean;
	private _marketTypeStr: string;

	constructor(
		readonly marketIndex: number,
		readonly marketType: MarketType
	) {
		this._key = MarketId.key(marketIndex, marketType);
		this._isSpot = ENUM_UTILS.match(marketType, MarketType.SPOT);
		this._isPerp = ENUM_UTILS.match(marketType, MarketType.PERP);
		this._marketTypeStr = ENUM_UTILS.toStr(marketType);
	}

	private static getOrCreate(marketIndex: number, marketType: MarketType) {
		const key = MarketId.key(marketIndex, marketType);
		if (MarketId.cache.has(key)) {
			return MarketId.cache.get(key)!;
		}
		const marketId = new MarketId(marketIndex, marketType);
		MarketId.cache.set(key, marketId);
		return marketId;
	}

	static createPerpMarket(marketIndex: number) {
		return MarketId.getOrCreate(marketIndex, MarketType.PERP);
	}

	static createSpotMarket(marketIndex: number) {
		return MarketId.getOrCreate(marketIndex, MarketType.SPOT);
	}

	static getMarketIdFromKey(key: MarketKey) {
		if (MarketId.cache.has(key)) {
			return MarketId.cache.get(key)!;
		}
		const [marketType, marketIndex] = key.split('_');
		const marketId = new MarketId(
			parseInt(marketIndex),
			ENUM_UTILS.toObj(marketType)!
		);
		MarketId.cache.set(key, marketId);
		return marketId;
	}

	get isSpot() {
		return this._isSpot;
	}

	get isPerp() {
		return this._isPerp;
	}

	get marketTypeStr() {
		return this._marketTypeStr;
	}

	static key(marketIndex: number, marketType: MarketType): MarketKey {
		return `${ENUM_UTILS.toStr(marketType)}_${marketIndex}` as MarketKey;
	}

	/**
	 * Returns a unique string that can be used as a key in a map.
	 */
	get key(): MarketKey {
		return this._key; // Micro-optimisation to avoid string concatenation every time the key is accessed
	}

	equals(other: MarketId) {
		return (
			ENUM_UTILS.match(this.marketType, other.marketType) &&
			this.marketIndex === other.marketIndex
		);
	}
}

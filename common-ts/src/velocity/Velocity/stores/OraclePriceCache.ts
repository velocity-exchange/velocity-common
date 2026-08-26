import { BN, OraclePriceData, ZERO } from '@velocity-exchange/sdk';
import { Subject, Subscription } from 'rxjs';
import { MarketKey } from '../../../types';

export type OraclePriceLookup = Record<MarketKey, OraclePriceData>;

export class OraclePriceCache {
	private _store: OraclePriceLookup = {};
	private updatesSubject$ = new Subject<OraclePriceLookup>();

	get store() {
		return { ...this._store };
	}

	public updateOraclePrices(
		...oraclePrices: (OraclePriceData & { marketKey: MarketKey })[]
	) {
		const updatedOraclePrices: OraclePriceLookup = {};

		oraclePrices.forEach(({ marketKey, ...oraclePriceData }) => {
			const prevOraclePriceState = this._store[marketKey];

			if (
				!prevOraclePriceState?.slot ||
				prevOraclePriceState.slot.lt(oraclePriceData.slot)
			) {
				updatedOraclePrices[marketKey] = oraclePriceData;
			}
		});

		this._store = { ...this._store, ...updatedOraclePrices };

		if (Object.keys(updatedOraclePrices).length > 0) {
			this.updatesSubject$.next(updatedOraclePrices);
		}
	}

	public getOraclePriceData(marketKey: MarketKey): OraclePriceData {
		const storeData = this._store[marketKey];
		if (!storeData) {
			return {
				price: ZERO,
				slot: ZERO,
				confidence: ZERO,
				hasSufficientNumberOfDataPoints: false,
				twap: ZERO,
				twapConfidence: ZERO,
				maxPrice: ZERO,
			};
		}

		return storeData;
	}

	public getOraclePrice(marketKey: MarketKey): BN {
		return this.getOraclePriceData(marketKey).price;
	}

	public onUpdate(
		callback: (oraclePriceLookup: OraclePriceLookup) => void
	): Subscription {
		const subscription = this.updatesSubject$.subscribe((oraclePriceLookup) => {
			callback(oraclePriceLookup);
		});

		return subscription;
	}

	public destroy(): void {
		this.updatesSubject$.complete();
	}
}

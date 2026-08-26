import { BN, ZERO } from '@velocity-exchange/sdk';
import { Subject, Subscription } from 'rxjs';
import { MarketKey } from '../../../types';

export type MarkPriceData = {
	markPrice: BN;
	bestBid: BN;
	bestAsk: BN;
	lastUpdateSlot: number;
};

export type MarkPriceLookup = Record<MarketKey, MarkPriceData>;

export class MarkPriceCache {
	private _store: MarkPriceLookup = {};
	private updatesSubject$ = new Subject<MarkPriceLookup>();

	get store() {
		return { ...this._store };
	}

	public updateMarkPrices(
		...markPrices: ({
			marketKey: MarketKey;
		} & MarkPriceData)[]
	) {
		const updatedMarkPrices: MarkPriceLookup = {};

		markPrices.forEach(
			({ marketKey, markPrice, bestBid, bestAsk, lastUpdateSlot }) => {
				const currentMarkPriceState = this._store[marketKey];

				if (
					!currentMarkPriceState ||
					currentMarkPriceState.lastUpdateSlot < lastUpdateSlot
				) {
					updatedMarkPrices[marketKey] = {
						markPrice,
						bestBid,
						bestAsk,
						lastUpdateSlot,
					};
				}
			}
		);

		this._store = { ...this._store, ...updatedMarkPrices };

		if (Object.keys(updatedMarkPrices).length > 0) {
			this.updatesSubject$.next(updatedMarkPrices);
		}
	}

	public getMarkPriceData(marketKey: MarketKey): MarkPriceData {
		const storeData = this._store[marketKey];
		if (!storeData) {
			return {
				markPrice: ZERO,
				bestBid: ZERO,
				bestAsk: ZERO,
				lastUpdateSlot: 0,
			};
		}

		return storeData;
	}

	public getMarkPrice(marketKey: MarketKey): BN {
		return this.getMarkPriceData(marketKey).markPrice;
	}

	public onUpdate(
		callback: (markPriceLookup: MarkPriceLookup) => void
	): Subscription {
		const subscription = this.updatesSubject$.subscribe((markPriceLookup) => {
			callback(markPriceLookup);
		});

		return subscription;
	}

	public destroy(): void {
		this.updatesSubject$.complete();
	}
}

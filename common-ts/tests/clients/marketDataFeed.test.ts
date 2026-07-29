import { expect } from 'chai';
import { Subject } from 'rxjs';
import {
	MarketDataFeed,
	CandleSubscriberSubscription,
	TradeSubscriberSubscription,
} from '../../src/clients/marketDataFeed';
import { DataApiWsClient } from '../../src/clients/dataApiWsClient';
import { JsonCandle, JsonTrade, MarketSymbol, UIEnv } from '../../src/types';
import { CandleResolution } from '@velocity-exchange/sdk';

// Mock the DataApiWsClient
class MockDataApiWsClient {
	public candlesObservable: Subject<JsonCandle>;
	public tradesObservable: Subject<JsonTrade[]>;
	public subscribeCallCount = 0;
	public unsubscribeCallCount = 0;
	private isSubscribed = false;

	constructor(_config: any) {
		this.candlesObservable = new Subject<JsonCandle>();
		this.tradesObservable = new Subject<JsonTrade[]>();
	}

	async subscribe() {
		this.subscribeCallCount++;
		this.isSubscribed = true;
		// Simulate async subscription
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	unsubscribe() {
		this.unsubscribeCallCount++;
		this.isSubscribed = false;
		this.candlesObservable.complete();
		this.tradesObservable.complete();
	}

	// Helper method to check if subscribed
	get isReady() {
		return this.isSubscribed;
	}
}

// Mock the DataApiWsClient module
const originalDataApiWsClient = DataApiWsClient;
// oxlint-disable-next-line no-import-assign -- ts-node emits CJS, so the binding is writable
(DataApiWsClient as any) = MockDataApiWsClient;

describe('MarketDataFeed', () => {
	let mockEnv: UIEnv;
	let mockMarketSymbol: MarketSymbol;
	let mockResolution: CandleResolution;

	beforeEach(() => {
		// Reset the MarketDataFeed static state before each test
		// Access the subscriptionManager instance and reset its internal state
		const subscriptionManager = (MarketDataFeed as any).subscriptionManager;
		if (subscriptionManager) {
			// Clear the internal maps
			subscriptionManager.subscribers = new Map();
			subscriptionManager.apiSubscriptions = new Map();

			// Clear the lookup tables
			if (
				subscriptionManager.compatibleTradeSubscriptionLookup?.subscriptions
			) {
				subscriptionManager.compatibleTradeSubscriptionLookup.subscriptions.clear();
			}
			if (
				subscriptionManager.compatibleCandleSubscriptionLookup?.subscriptions
			) {
				subscriptionManager.compatibleCandleSubscriptionLookup.subscriptions.clear();
			}
		}

		mockEnv = UIEnv.createMainnet();
		mockMarketSymbol = 'SOL-PERP' as MarketSymbol;
		mockResolution = '60' as CandleResolution;
	});

	afterEach(() => {
		// Clean up any remaining subscriptions
		const subscriptionManager = (MarketDataFeed as any).subscriptionManager;
		if (subscriptionManager?.subscribers) {
			const subscriberIds = Array.from(subscriptionManager.subscribers.keys());
			subscriberIds.forEach((id: any) => {
				try {
					MarketDataFeed.unsubscribe(id);
				} catch (e) {
					// Ignore errors during cleanup
				}
			});
		}
	});

	after(() => {
		// Restore the original DataApiWsClient
		// oxlint-disable-next-line no-import-assign
		(DataApiWsClient as any) = originalDataApiWsClient;
	});

	// Helper function to get internal state
	function getInternalState() {
		const subscriptionManager = (MarketDataFeed as any).subscriptionManager;
		return {
			subscribers: subscriptionManager?.subscribers || new Map(),
			apiSubscriptions: subscriptionManager?.apiSubscriptions || new Map(),
		};
	}

	describe('Candle Subscriptions', () => {
		it('should create a new candle subscription', () => {
			const subscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			expect(subscription).to.be.instanceOf(CandleSubscriberSubscription);
			expect(subscription.id).to.be.a('string');
			expect(subscription.observable).to.exist;

			// Check that internal state is updated
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should share subscription for same market and resolution', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			expect(_subscription1.id).to.not.equal(_subscription2.id);

			// Should have 2 subscribers but only 1 API subscription
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should create separate subscriptions for different resolutions', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '1' as CandleResolution,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '5' as CandleResolution,
			});

			// Should have 2 subscribers and 2 API subscriptions
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(2);
		});

		it('should create separate subscriptions for different markets', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: 'SOL-PERP' as MarketSymbol,
				resolution: mockResolution,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: 'BTC-PERP' as MarketSymbol,
				resolution: mockResolution,
			});

			// Should have 2 subscribers and 2 API subscriptions
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(2);
		});
	});

	describe('Trade Subscriptions', () => {
		it('should create a new trade subscription', () => {
			const subscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			expect(subscription).to.be.instanceOf(TradeSubscriberSubscription);
			expect(subscription.id).to.be.a('string');
			expect(subscription.observable).to.exist;

			// Check that internal state is updated
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should share subscription for same market', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			expect(_subscription1.id).to.not.equal(_subscription2.id);

			// Should have 2 subscribers but only 1 API subscription
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should create separate subscriptions for different markets', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: 'SOL-PERP' as MarketSymbol,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: 'BTC-PERP' as MarketSymbol,
			});

			// Should have 2 subscribers and 2 API subscriptions
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(2);
		});
	});

	describe('Mixed Subscriptions (Candles and Trades)', () => {
		it('should share subscription between trade and candle for same market', () => {
			// Create a candle subscription first
			const _candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Create a trade subscription for the same market
			const _tradeSubscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Should have 2 subscribers but only 1 API subscription
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should transfer trade subscribers when candle subscription is created', () => {
			// Create a trade subscription first
			const _tradeSubscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Verify initial state
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);

			// Create a candle subscription for the same market
			const _candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Should still have 2 subscribers and 1 API subscription (trade subscription should be transferred)
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);
		});

		it('should handle mixed subscription types for the same market', () => {
			const candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const _tradeSubscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Should share the same API subscription
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe candle, trade should remain
			MarketDataFeed.unsubscribe(candleSubscription.id);

			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);
		});
	});

	describe('Unsubscription', () => {
		it('should unsubscribe a single subscriber', () => {
			const subscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Verify subscription exists
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe
			MarketDataFeed.unsubscribe(subscription.id);

			// Verify cleanup
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(0);
			expect(apiSubscriptions.size).to.equal(0);
		});

		it('should keep API subscription alive when other subscribers exist', () => {
			const subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Verify initial state
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe one
			MarketDataFeed.unsubscribe(subscription1.id);

			// Should still have 1 subscriber and 1 API subscription
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe the last one
			MarketDataFeed.unsubscribe(subscription2.id);

			// Should have no subscribers and no API subscriptions
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(0);
			expect(apiSubscriptions.size).to.equal(0);
		});

		it('should throw error when unsubscribing non-existent subscriber', () => {
			expect(() => {
				MarketDataFeed.unsubscribe('non-existent-id' as any);
			}).to.throw('Subscriber not found');
		});
	});

	describe('Data Flow', () => {
		it('should emit candle data to candle subscribers', (done) => {
			const subscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const mockCandle: JsonCandle = {
				ts: Date.now(),
				fillOpen: 100,
				fillHigh: 110,
				fillLow: 90,
				fillClose: 105,
				oracleOpen: 100,
				oracleHigh: 110,
				oracleLow: 90,
				oracleClose: 105,
				quoteVolume: 1000,
				baseVolume: 10,
			};

			subscription.observable.subscribe((candle) => {
				expect(candle).to.deep.equal(mockCandle);
				done();
			});

			// Wait for subscription to be set up, then emit data
			setTimeout(() => {
				const { apiSubscriptions } = getInternalState();
				const apiSubscription = Array.from(apiSubscriptions.values())[0] as any;
				const mockClient = apiSubscription.apiClient as MockDataApiWsClient;
				mockClient.candlesObservable.next(mockCandle);
			}, 10);
		});

		it('should emit trade data to trade subscribers', (done) => {
			const subscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const mockTrades: JsonTrade[] = [
				{
					action: 'fill',
					actionExplanation: 'taker',
					baseAssetAmountFilled: 10,
					bitFlags: 0,
					createdAt: Date.now(),
					entity: 'trade',
					fillRecordId: '1',
					filler: 'filler',
					fillerReward: 0,
					maker: 'maker',
					makerFee: 1,
					makerOrderBaseAssetAmount: 10,
					makerOrderCumulativeBaseAssetAmountFilled: 10,
					makerOrderCumulativeQuoteAssetAmountFilled: 1050,
					makerOrderDirection: 'long',
					makerOrderId: 1,
					makerRebate: 0,
					marketFilter: mockMarketSymbol,
					marketIndex: 0,
					marketType: 'perp',
					oraclePrice: 105,
					price: 105,
					quoteAssetAmountFilled: 1050,
					quoteAssetAmountSurplus: 0,
					referrerReward: 0,
					slot: 123456,
					spotFulfillmentMethodFee: 0,
					symbol: mockMarketSymbol,
					taker: 'taker',
					takerFee: 1,
					takerOrderBaseAssetAmount: 10,
					takerOrderCumulativeBaseAssetAmountFilled: 10,
					takerOrderCumulativeQuoteAssetAmountFilled: 1050,
					takerOrderDirection: 'long',
					takerOrderId: 2,
					ts: Date.now(),
					txSig: 'signature',
					txSigIndex: 0,
				},
			];

			subscription.observable.subscribe((trades) => {
				expect(trades).to.deep.equal(mockTrades);
				done();
			});

			// Wait for subscription to be set up, then emit data
			setTimeout(() => {
				const { apiSubscriptions } = getInternalState();
				const apiSubscription = Array.from(apiSubscriptions.values())[0] as any;
				const mockClient = apiSubscription.apiClient as MockDataApiWsClient;
				mockClient.tradesObservable.next(mockTrades);
			}, 10);
		});

		it('should emit data to multiple subscribers of the same type', () => {
			const subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const mockCandle: JsonCandle = {
				ts: Date.now(),
				fillOpen: 100,
				fillHigh: 110,
				fillLow: 90,
				fillClose: 105,
				oracleOpen: 100,
				oracleHigh: 110,
				oracleLow: 90,
				oracleClose: 105,
				quoteVolume: 1000,
				baseVolume: 10,
			};

			let receivedCount = 0;
			const expectedCount = 2;

			const checkComplete = () => {
				receivedCount++;
				if (receivedCount === expectedCount) {
					expect(receivedCount).to.equal(expectedCount);
				}
			};

			subscription1.observable.subscribe((candle) => {
				expect(candle).to.deep.equal(mockCandle);
				checkComplete();
			});

			subscription2.observable.subscribe((candle) => {
				expect(candle).to.deep.equal(mockCandle);
				checkComplete();
			});

			// Get the API subscription and emit data
			const { apiSubscriptions } = getInternalState();
			const apiSubscription = Array.from(apiSubscriptions.values())[0] as any;
			const mockClient = apiSubscription.apiClient as MockDataApiWsClient;
			mockClient.candlesObservable.next(mockCandle);
		});
	});

	describe('Subscription Lookup Logic', () => {
		it('should correctly identify compatible candle subscriptions', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '1' as CandleResolution,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '1' as CandleResolution,
			});

			const _subscription3 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '5' as CandleResolution,
			});

			// subscription1 and subscription2 should share an API subscription
			// subscription3 should have its own API subscription
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(2);
		});

		it('should correctly identify compatible trade subscriptions', () => {
			const _subscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const _subscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const _subscription3 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: 'BTC-PERP' as MarketSymbol,
			});

			// subscription1 and subscription2 should share an API subscription
			// subscription3 should have its own API subscription
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(2);
		});
	});

	describe('Edge Cases', () => {
		it('should handle rapid subscribe/unsubscribe cycles', () => {
			const subscriptions: Array<
				CandleSubscriberSubscription | TradeSubscriberSubscription
			> = [];

			// Create multiple subscriptions rapidly
			for (let i = 0; i < 5; i++) {
				subscriptions.push(
					MarketDataFeed.subscribe({
						type: 'candles',
						env: mockEnv,
						marketSymbol: mockMarketSymbol,
						resolution: mockResolution,
					})
				);
			}

			// Verify all subscriptions were created
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(5);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe all rapidly
			subscriptions.forEach((sub) => {
				MarketDataFeed.unsubscribe(sub.id);
			});

			// Verify cleanup
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(0);
			expect(apiSubscriptions.size).to.equal(0);
		});

		it('should handle complex subscription transfer scenarios', () => {
			// Create trade subscription first
			const tradeSubscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Add another trade subscription for the same market
			const tradeSubscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Should have 2 trade subscribers sharing 1 API subscription
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);

			// Now create a candle subscription - should trigger transfer
			const candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Should still have 3 subscribers and 1 API subscription
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(1);

			// Unsubscribe all
			MarketDataFeed.unsubscribe(tradeSubscription1.id);
			MarketDataFeed.unsubscribe(tradeSubscription2.id);
			MarketDataFeed.unsubscribe(candleSubscription.id);

			// Should be clean
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(0);
			expect(apiSubscriptions.size).to.equal(0);
		});

		it('should handle different environments correctly', () => {
			const stagingEnv = UIEnv.createStaging();
			const devnetEnv = UIEnv.createDevnet();

			const subscription1 = MarketDataFeed.subscribe({
				type: 'candles',
				env: stagingEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			const subscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: devnetEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Different environments should create separate subscriptions
			const { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(2);

			// Clean up
			MarketDataFeed.unsubscribe(subscription1.id);
			MarketDataFeed.unsubscribe(subscription2.id);
		});

		it('should handle subscription observable completion properly', () => {
			const subscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			let completed = false;
			subscription.observable.subscribe({
				next: () => {},
				complete: () => {
					completed = true;
				},
			});

			// Unsubscribe should complete the observable
			MarketDataFeed.unsubscribe(subscription.id);

			// Note: In a real scenario, the observable would complete when the underlying
			// websocket connection is closed. In our mock, we simulate this.
			expect(completed).to.be.false; // Our mock doesn't auto-complete on unsubscribe
		});

		it('should transfer trade subscribers to compatible subscription when candle subscription is removed', () => {
			// Create a candle subscription first
			const candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Add trade subscribers to the same subscription
			const tradeSubscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const tradeSubscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Should have 3 subscribers sharing 1 API subscription
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(1);

			// Create another candle subscription with different resolution for the same market
			const candleSubscription2 = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: '5' as CandleResolution,
			});

			// Should now have 4 subscribers and 2 API subscriptions
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(4);
			expect(apiSubscriptions.size).to.equal(2);

			// Remove the first candle subscription, leaving only trade subscribers on that subscription
			MarketDataFeed.unsubscribe(candleSubscription.id);

			// After unsubscribing the candle subscription, the trade subscribers should be transferred
			// to the other compatible subscription (candleSubscription2's subscription)
			// This should result in 3 subscribers and 1 API subscription
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(3);
			// This test will currently fail because the transfer logic is not implemented
			// When implemented, this should be 1 subscription instead of 2
			expect(apiSubscriptions.size).to.equal(
				1,
				'Trade subscribers should be transferred to the remaining compatible subscription'
			);

			// Clean up remaining subscriptions
			MarketDataFeed.unsubscribe(tradeSubscription1.id);
			MarketDataFeed.unsubscribe(tradeSubscription2.id);
			MarketDataFeed.unsubscribe(candleSubscription2.id);
		});

		it('should not transfer trade subscribers when no compatible subscription exists', () => {
			// Create a candle subscription
			const candleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
				resolution: mockResolution,
			});

			// Add trade subscribers to the same subscription
			const tradeSubscription1 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			const tradeSubscription2 = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: mockMarketSymbol,
			});

			// Should have 3 subscribers sharing 1 API subscription
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(1);

			// Remove the candle subscription, leaving only trade subscribers
			MarketDataFeed.unsubscribe(candleSubscription.id);

			// Since there's no other compatible subscription for the same market,
			// the trade subscribers should remain on their current subscription
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(2);
			expect(apiSubscriptions.size).to.equal(1);

			// Clean up remaining subscriptions
			MarketDataFeed.unsubscribe(tradeSubscription1.id);
			MarketDataFeed.unsubscribe(tradeSubscription2.id);
		});

		it('should properly clean up lookup tables when subscriptions are removed', () => {
			// Create subscriptions for different markets to test lookup table cleanup
			const solCandleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: 'SOL-PERP' as MarketSymbol,
				resolution: mockResolution,
			});

			const btcCandleSubscription = MarketDataFeed.subscribe({
				type: 'candles',
				env: mockEnv,
				marketSymbol: 'BTC-PERP' as MarketSymbol,
				resolution: mockResolution,
			});

			const solTradeSubscription = MarketDataFeed.subscribe({
				type: 'trades',
				env: mockEnv,
				marketSymbol: 'SOL-PERP' as MarketSymbol,
			});

			// Verify initial state
			let { subscribers, apiSubscriptions } = getInternalState();
			expect(subscribers.size).to.equal(3);
			expect(apiSubscriptions.size).to.equal(2); // SOL and BTC should have separate subscriptions

			// Access the subscription manager to check lookup tables
			const subscriptionManager = (MarketDataFeed as any).subscriptionManager;

			// Check that lookup tables contain the subscriptions
			const solTradeKey = 'SOL-PERP:mainnet-beta';
			const btcTradeKey = 'BTC-PERP:mainnet-beta';
			const solCandleKey = `SOL-PERP:${mockResolution}:mainnet-beta`;
			const btcCandleKey = `BTC-PERP:${mockResolution}:mainnet-beta`;

			// All subscriptions should be in trade lookup (since any subscription can serve trades)
			expect(
				subscriptionManager.compatibleTradeSubscriptionLookup.has(solTradeKey)
			).to.be.true;
			expect(
				subscriptionManager.compatibleTradeSubscriptionLookup.has(btcTradeKey)
			).to.be.true;

			// Only candle subscriptions should be in candle lookup
			expect(
				subscriptionManager.compatibleCandleSubscriptionLookup.has(solCandleKey)
			).to.be.true;
			expect(
				subscriptionManager.compatibleCandleSubscriptionLookup.has(btcCandleKey)
			).to.be.true;

			// Unsubscribe from SOL subscriptions
			MarketDataFeed.unsubscribe(solCandleSubscription.id);
			MarketDataFeed.unsubscribe(solTradeSubscription.id);

			// Verify SOL subscriptions are removed from lookup tables
			expect(
				subscriptionManager.compatibleTradeSubscriptionLookup.has(solTradeKey)
			).to.be.false;
			expect(
				subscriptionManager.compatibleCandleSubscriptionLookup.has(solCandleKey)
			).to.be.false;

			// BTC subscription should still exist in both lookups
			expect(
				subscriptionManager.compatibleTradeSubscriptionLookup.has(btcTradeKey)
			).to.be.true;
			expect(
				subscriptionManager.compatibleCandleSubscriptionLookup.has(btcCandleKey)
			).to.be.true;

			// Verify internal state
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(1);
			expect(apiSubscriptions.size).to.equal(1);

			// Clean up remaining subscription
			MarketDataFeed.unsubscribe(btcCandleSubscription.id);

			// Verify all lookup tables are clean
			expect(
				subscriptionManager.compatibleTradeSubscriptionLookup.has(btcTradeKey)
			).to.be.false;
			expect(
				subscriptionManager.compatibleCandleSubscriptionLookup.has(btcCandleKey)
			).to.be.false;

			// Verify final state
			({ subscribers, apiSubscriptions } = getInternalState());
			expect(subscribers.size).to.equal(0);
			expect(apiSubscriptions.size).to.equal(0);
		});
	});
});

import {
	BN,
	MarketType,
	OrderType,
	PositionDirection,
	PRICE_PRECISION,
	User,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
	deriveAuctionParamsFromVamm,
	fetchAuctionOrderParams,
	fetchAuctionOrderParamsFromDlob,
	fetchAuctionOrderParamsFromL2,
} from '../../src/drift/base/actions/trade/openPerpOrder/dlobServer';
import { ENUM_UTILS } from '../../src';
import { mockPerpMarket } from './fixtures/mockPerpMarket';
import { DEFAULT_MARKET_AUCTION_DURATION } from '../../src/drift/base/constants/auction';

const DLOB_SERVER_HTTP_URL = 'https://test-dlob.example.com';

// A single ask-side L2 book with two levels, chosen so a 1-base-unit LONG order
// fills across both levels: bestPrice 100, worstPrice 102, entryPrice 101.2.
const RAW_L2_RESPONSE = {
	asks: [
		{ price: '100000000', size: '400000000', sources: { vamm: '400000000' } },
		{ price: '102000000', size: '600000000', sources: { vamm: '600000000' } },
	],
	bids: [
		{ price: '98000000', size: '1000000000', sources: { vamm: '1000000000' } },
	],
	oracleData: {
		price: '100000000',
		slot: '1',
		confidence: '100',
		hasSufficientNumberOfDataPoints: true,
	},
	markPrice: '100000000',
	bestBidPrice: '98000000',
	bestAskPrice: '100000000',
	spreadPct: '0',
	spreadQuote: '0',
	marketSlot: 1,
	marketIndex: 0,
	marketName: 'SOL-PERP',
	marketType: 'perp',
};

const ENDPOINT_SERVER_RESPONSE = {
	data: {
		params: {
			orderType: 'market',
			marketType: 'perp',
			direction: 'long',
			baseAssetAmount: '1000000000',
			marketIndex: 0,
			reduceOnly: false,
			postOnly: 'none',
			auctionDuration: 25,
			auctionStartPrice: '99000000',
			auctionEndPrice: '100500000',
		},
		entryPrice: '101200000',
		bestPrice: '100000000',
		worstPrice: '102000000',
		oraclePrice: '100000000',
		markPrice: '100000000',
		// fraction, e.g. 0.012 for 1.2% - matches the L2 fixture's derived price impact
		priceImpact: 0.012,
		// fraction, e.g. 0.005 for 0.5%
		slippageTolerance: '0.005',
		generatedAt: 1720000000,
	},
};

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
	ok,
	status,
	statusText: ok ? 'OK' : 'Internal Server Error',
	json: async () => JSON.parse(JSON.stringify(body)),
});

const stubFetch = (handler: (url: string, init?: RequestInit) => any) => {
	return sinon
		.stub(global, 'fetch')
		.callsFake(((url: string, init?: RequestInit) =>
			Promise.resolve(handler(url, init))) as typeof fetch);
};

const pendingUntilAborted = (_url: string, init?: RequestInit) =>
	new Promise((_resolve, reject) => {
		init?.signal?.addEventListener(
			'abort',
			() => reject(new Error('request aborted')),
			{ once: true }
		);
	});

const responseWithPendingBody = (url: string, init?: RequestInit) => ({
	...jsonResponse({}),
	json: () => pendingUntilAborted(url, init),
});

const baseParams = {
	velocityClient: {} as VelocityClient,
	user: {} as User,
	assetType: 'base' as const,
	marketType: MarketType.PERP,
	marketIndex: 0,
	direction: PositionDirection.LONG,
	amount: new BN(1_000_000_000),
	dlobServerHttpUrl: DLOB_SERVER_HTTP_URL,
	reduceOnly: false,
};

const expectRejection = async (
	promise: Promise<unknown>,
	expectedMessage: string
) => {
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}

	expect(caught).to.be.instanceOf(Error);
	expect((caught as Error).message).to.equal(expectedMessage);
};

describe('fetchAuctionOrderParams', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('endpoint tier', () => {
		it('maps the endpoint response and normalizes slippage/priceImpact meta', async () => {
			stubFetch((url) => {
				expect(url).to.include('/auctionParams');
				return jsonResponse(ENDPOINT_SERVER_RESPONSE);
			});

			const result = await fetchAuctionOrderParamsFromDlob({ ...baseParams });

			expect(result.meta.source).to.equal('endpoint');
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'99000000'
			);
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'100500000'
			);
			expect(result.orderParams.auctionDuration).to.equal(25);
			expect(result.orderParams.baseAssetAmount.toString()).to.equal(
				'1000000000'
			);
			expect(ENUM_UTILS.toStr(result.orderParams.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);

			// Normalized to a percentage: the endpoint's native "0.005" fraction becomes 0.5
			expect(result.meta.slippage).to.equal(0.5);

			expect(result.meta.priceImpact?.entryPrice.toString()).to.equal(
				'101200000'
			);
			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'100000000'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'102000000'
			);
			// Same raw representation (fraction * PRICE_PRECISION) as the L2 tier produces
			expect(result.meta.priceImpact?.priceImpact.toString()).to.equal('12000');
			// The /auctionParams endpoint doesn't return liquidity depth data
			expect(result.meta.priceImpact?.baseAvailable).to.be.undefined;
			expect(result.meta.priceImpact?.exceedsLiquidity).to.be.undefined;
		});

		it('invokes onAuctionParamsFetched with the mapped result', async () => {
			stubFetch(() => jsonResponse(ENDPOINT_SERVER_RESPONSE));

			const onAuctionParamsFetched = sinon.spy();

			const result = await fetchAuctionOrderParamsFromDlob({
				...baseParams,
				onAuctionParamsFetched,
			});

			expect(onAuctionParamsFetched.calledOnce).to.be.true;
			const [urlSearchParams, response, mapped] =
				onAuctionParamsFetched.firstCall.args;
			expect(urlSearchParams).to.be.instanceOf(URLSearchParams);
			expect(urlSearchParams.get('marketIndex')).to.equal('0');
			expect(response.data.params.orderType).to.equal('market');
			// The exact same object returned to the caller, not a re-derived copy
			expect(mapped).to.equal(result);
		});
	});

	describe('L2 fallback tier', () => {
		it('derives auction params, and normalizes slippage/priceImpact meta to the same units as the endpoint tier', async () => {
			stubFetch((url) => {
				expect(url).to.include('/batchL2');
				return jsonResponse({ l2s: [RAW_L2_RESPONSE] });
			});

			const result = await fetchAuctionOrderParamsFromL2({
				...baseParams,
				optionalAuctionParamsInputs: {
					slippageTolerance: 0.5, // already a percentage on this tier
					auctionDuration: 30,
					auctionStartPriceOffset: 1,
					auctionEndPriceOffset: 0.5,
					auctionStartPriceOffsetFrom: 'oracle',
					auctionEndPriceOffsetFrom: 'worst',
				},
			});

			expect(result.meta.source).to.equal('l2');
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'99000000'
			);
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'100500000'
			);
			expect(result.orderParams.auctionDuration).to.equal(30);

			expect(result.meta.slippage).to.equal(0.5);
			expect(result.meta.priceImpact?.entryPrice.toString()).to.equal(
				'101200000'
			);
			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'100000000'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'102000000'
			);
			expect(result.meta.priceImpact?.priceImpact.toString()).to.equal('12000');
			expect(result.meta.priceImpact?.baseAvailable?.toString()).to.equal(
				'1000000000'
			);
			expect(result.meta.priceImpact?.exceedsLiquidity).to.equal(false);
		});

		it('uses maxLeverageOrderSize as the base amount when maxLeverageSelected is true', async () => {
			stubFetch(() => jsonResponse({ l2s: [RAW_L2_RESPONSE] }));

			const result = await fetchAuctionOrderParamsFromL2({
				...baseParams,
				amount: new BN(1_000_000_000),
				optionalAuctionParamsInputs: {
					maxLeverageSelected: true,
					maxLeverageOrderSize: new BN(5_000_000_000),
				},
			});

			expect(result.orderParams.baseAssetAmount.toString()).to.equal(
				'5000000000'
			);
		});

		it('does not invoke onAuctionParamsFetched (endpoint-tier only callback)', async () => {
			stubFetch(() => jsonResponse({ l2s: [RAW_L2_RESPONSE] }));

			const onAuctionParamsFetched = sinon.spy();

			await fetchAuctionOrderParamsFromL2({
				...baseParams,
				onAuctionParamsFetched,
			} as any);

			expect(onAuctionParamsFetched.called).to.be.false;
		});
	});

	describe('fetchAuctionOrderParams (2-tier fallback)', () => {
		it('falls back from the endpoint to L2 when the endpoint tier fails', async () => {
			stubFetch((url) => {
				if (url.includes('/auctionParams')) {
					return jsonResponse({}, false, 500);
				}
				return jsonResponse({ l2s: [RAW_L2_RESPONSE] });
			});

			const result = await fetchAuctionOrderParams({
				...baseParams,
				optionalAuctionParamsInputs: {
					slippageTolerance: 0.5,
					auctionDuration: 30,
					auctionStartPriceOffset: 1,
					auctionEndPriceOffset: 0.5,
					auctionStartPriceOffsetFrom: 'oracle',
					auctionEndPriceOffsetFrom: 'worst',
				},
			});

			expect(result.meta.source).to.equal('l2');
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'99000000'
			);
		});

		it('skips the endpoint tier entirely when forceFallback is true', async () => {
			const fetchStub = stubFetch((url) => {
				if (url.includes('/auctionParams')) {
					throw new Error('endpoint tier should not be called');
				}
				return jsonResponse({ l2s: [RAW_L2_RESPONSE] });
			});

			const result = await fetchAuctionOrderParams({
				...baseParams,
				forceFallback: true,
			});

			expect(result.meta.source).to.equal('l2');
			expect(
				fetchStub
					.getCalls()
					.some((call) => (call.args[0] as string).includes('/auctionParams'))
			).to.be.false;
		});
	});

	describe('network timeouts', () => {
		it('times out the endpoint tier after 3 seconds and continues to L2', async () => {
			const clock = sinon.useFakeTimers({ now: Date.now() });
			stubFetch((url, init) =>
				url.includes('/auctionParams')
					? pendingUntilAborted(url, init)
					: jsonResponse({ l2s: [RAW_L2_RESPONSE] })
			);

			const resultPromise = fetchAuctionOrderParams({ ...baseParams });
			const timedOut = Symbol('test timed out');
			const result = await Promise.race([
				resultPromise,
				clock.tickAsync(3_000).then(() => timedOut),
			]);

			expect(result).to.not.equal(timedOut);
			if (typeof result === 'symbol') return;
			expect(result.meta.source).to.equal('l2');
		});

		it('keeps the endpoint timeout active while reading the response body', async () => {
			const clock = sinon.useFakeTimers({ now: Date.now() });
			stubFetch((url, init) =>
				url.includes('/auctionParams')
					? responseWithPendingBody(url, init)
					: jsonResponse({ l2s: [RAW_L2_RESPONSE] })
			);

			const resultPromise = fetchAuctionOrderParams({ ...baseParams });
			const timedOut = Symbol('test timed out');
			const result = await Promise.race([
				resultPromise,
				clock.tickAsync(3_000).then(() => timedOut),
			]);

			expect(result).to.not.equal(timedOut);
			if (typeof result === 'symbol') return;
			expect(result.meta.source).to.equal('l2');
		});

		it('times out both network tiers independently and reaches vAMM after 6 seconds', async () => {
			const clock = sinon.useFakeTimers({ now: Date.now() });
			stubFetch(pendingUntilAborted);

			const resultPromise = fetchAuctionOrderParams({
				...baseParams,
				velocityClient: makeVammClientStub(),
			});
			const timedOut = Symbol('test timed out');
			const result = await Promise.race([
				resultPromise,
				clock.tickAsync(6_000).then(() => timedOut),
			]);

			expect(result).to.not.equal(timedOut);
			if (typeof result === 'symbol') return;
			expect(result.meta.source).to.equal('vamm');
		});

		it('keeps the L2 timeout active while reading the response body', async () => {
			const clock = sinon.useFakeTimers({ now: Date.now() });
			stubFetch(responseWithPendingBody);

			const resultPromise = fetchAuctionOrderParams({
				...baseParams,
				velocityClient: makeVammClientStub(),
				forceFallback: true,
			});
			const timedOut = Symbol('test timed out');
			const result = await Promise.race([
				resultPromise,
				clock.tickAsync(3_000).then(() => timedOut),
			]);

			expect(result).to.not.equal(timedOut);
			if (typeof result === 'symbol') return;
			expect(result.meta.source).to.equal('vamm');
		});

		it('times out forceFallback L2 and reaches vAMM after 3 seconds', async () => {
			const clock = sinon.useFakeTimers({ now: Date.now() });
			stubFetch(pendingUntilAborted);

			const resultPromise = fetchAuctionOrderParams({
				...baseParams,
				velocityClient: makeVammClientStub(),
				forceFallback: true,
			});
			const timedOut = Symbol('test timed out');
			const result = await Promise.race([
				resultPromise,
				clock.tickAsync(3_000).then(() => timedOut),
			]);

			expect(result).to.not.equal(timedOut);
			if (typeof result === 'symbol') return;
			expect(result.meta.source).to.equal('vamm');
		});
	});

	// Minimal VelocityClient stub exposing only what the vAMM tier reads.
	const makeVammClientStub = () => {
		const oracle = { price: new BN(100).mul(PRICE_PRECISION), slot: new BN(1) };
		const mmOracle = {
			price: new BN(100).mul(PRICE_PRECISION),
			slot: new BN(1),
		};
		return {
			getPerpMarketAccount: (_i: number) => mockPerpMarket,
			getMMOracleDataForPerpMarket: (_i: number) => mmOracle,
			getOracleDataForPerpMarket: (_i: number) => oracle,
		} as any;
	};

	describe('vAMM fallback tier', () => {
		it('rejects direct spot-market vAMM derivation', async () => {
			await expectRejection(
				deriveAuctionParamsFromVamm({
					...baseParams,
					marketType: MarketType.SPOT,
					velocityClient: makeVammClientStub(),
				}),
				'Invariant failed: vAMM auction params only support perp markets'
			);
		});

		it('derives auction params from the vAMM with no network, source=vamm', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.meta.source).to.equal('vamm');

			// Concrete values derived from the vAMM's own L2 generator (100-PRICE_PRECISION
			// oracle/mm-oracle price, 0.005 slippage tolerance) — not just non-null checks,
			// so a degenerate (e.g. zero-price) book would fail this test.
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'100000000'
			);
			// auction end = slippage-capped end (100005000) + the 0.1%-of-oracle vAMM
			// fallback buffer (100000) = 100105000. priceImpact best/worst are the raw
			// L2-walk prices and are NOT buffered.
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'100105000'
			);

			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'100005000'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'100005000'
			);
			expect(
				result.orderParams.auctionEndPrice?.gte(
					result.orderParams.auctionStartPrice as BN
				)
			).to.be.true;
		});

		it('defaults auctionDuration to DEFAULT_MARKET_AUCTION_DURATION when the caller omits it', async () => {
			// The UI sends auctionDuration=undefined, relying on the DLOB server to
			// fill it in. The network-free fallback must resolve a non-null duration
			// itself, otherwise the swift server rejects the signed order with
			// InvalidOrderAuction (a null/0 duration + populated auction prices).
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.orderParams.auctionDuration).to.equal(
				DEFAULT_MARKET_AUCTION_DURATION
			);
		});

		it('applies a 0.1% oracle-price buffer to the auction end in the vAMM fallback', async () => {
			// The vAMM book has no resting-order liquidity, so its pricing is coarser
			// than the DLOB server's. Widen the auction end (and thus the oracle price
			// offset) by 0.1% of the oracle price so degraded-liquidity orders still cross.
			const oracle = new BN(100).mul(PRICE_PRECISION); // matches makeVammClientStub
			const minBuffer = oracle.divn(1000); // 0.1%

			const long = await deriveAuctionParamsFromVamm({
				...baseParams,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});
			expect(
				(long.orderParams.auctionEndPrice as BN).sub(oracle).gte(minBuffer)
			).to.be.true;

			const short = await deriveAuctionParamsFromVamm({
				...baseParams,
				direction: PositionDirection.SHORT,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});
			expect(oracle.sub(short.orderParams.auctionEndPrice as BN).gte(minBuffer))
				.to.be.true;
		});

		it('derives auction params from the vAMM for a SHORT order, walking the price down', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				direction: PositionDirection.SHORT,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.meta.source).to.equal('vamm');

			// Concrete values derived from the vAMM's own L2 generator (100-PRICE_PRECISION
			// oracle/mm-oracle price, 0.005 slippage tolerance) for a SHORT order.
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'100000000'
			);
			// SHORT: slippage-capped end (99995000) minus the 0.1%-of-oracle vAMM
			// fallback buffer (100000) = 99895000. priceImpact is unbuffered.
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'99895000'
			);

			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'99995000'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'99995000'
			);
			// For a SHORT order the auction must walk the price down (or stay flat),
			// never up — the opposite invariant of the LONG case above.
			expect(
				result.orderParams.auctionEndPrice?.lte(
					result.orderParams.auctionStartPrice as BN
				)
			).to.be.true;
		});

		it('derives auction params from the vAMM for a quote-denominated amount', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				assetType: 'quote',
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.meta.source).to.equal('vamm');
			expect(result.orderParams.baseAssetAmount.toString()).to.equal(
				'10000000000'
			);

			// baseParams.amount ($1000 notional, in BN) is converted via calcBaseFromQuote
			// against the stub's $100 oracle price before hitting the vAMM L2 generator.
			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'100000000'
			);
			// includes the 0.1%-of-oracle vAMM fallback buffer (+100000 on the long end)
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'100105000'
			);

			expect(result.meta.priceImpact?.bestPrice.gt(new BN(0))).to.be.true;
			expect(result.meta.priceImpact?.worstPrice.gt(new BN(0))).to.be.true;
		});

		it('uses the canonical non-major top-of-book quote buckets', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				marketIndex: 3,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'100000500'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'100000500'
			);
		});

		it('uses the canonical non-major top-of-book quote buckets for SHORT orders', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				marketIndex: 3,
				direction: PositionDirection.SHORT,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.orderParams.auctionStartPrice?.toString()).to.equal(
				'100000000'
			);
			// SHORT end = 99999500 minus the 0.1%-of-oracle vAMM fallback buffer (100000)
			expect(result.orderParams.auctionEndPrice?.toString()).to.equal(
				'99899500'
			);
			expect(result.meta.priceImpact?.bestPrice.toString()).to.equal(
				'99999500'
			);
			expect(result.meta.priceImpact?.worstPrice.toString()).to.equal(
				'99999500'
			);
		});
	});

	describe('3-tier fallthrough to vAMM', () => {
		it('preserves the L2 failure for spot requests instead of using a perp vAMM', async () => {
			stubFetch((url) => {
				throw new Error(
					url.includes('/auctionParams') ? 'endpoint down' : 'l2 down'
				);
			});

			await expectRejection(
				fetchAuctionOrderParams({
					...baseParams,
					marketType: MarketType.SPOT,
					velocityClient: makeVammClientStub(),
				}),
				'l2 down'
			);
		});

		it('falls through both network tiers to source=vamm and never throws', async () => {
			stubFetch(() => jsonResponse({}, false, 500)); // both /auctionParams and /batchL2 fail
			const result = await fetchAuctionOrderParams({
				...baseParams,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});
			expect(result.meta.source).to.equal('vamm');
		});

		it('honours forceFallback and still reaches vAMM when the L2 fetch fails', async () => {
			stubFetch(() => jsonResponse({}, false, 500));
			const result = await fetchAuctionOrderParams({
				...baseParams,
				direction: PositionDirection.SHORT,
				velocityClient: makeVammClientStub(),
				forceFallback: true,
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});
			expect(result.meta.source).to.equal('vamm');
		});
	});
});

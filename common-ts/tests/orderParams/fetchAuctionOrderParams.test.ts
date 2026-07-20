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

const stubFetch = (handler: (url: string) => any) => {
	return sinon
		.stub(global, 'fetch')
		.callsFake(((url: string) =>
			Promise.resolve(handler(url))) as typeof fetch);
};

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
		it('derives auction params from the vAMM with no network, source=vamm', async () => {
			const result = await deriveAuctionParamsFromVamm({
				...baseParams,
				velocityClient: makeVammClientStub(),
				optionalAuctionParamsInputs: { slippageTolerance: 0.005 },
			});

			expect(result.meta.source).to.equal('vamm');
			expect(result.orderParams.auctionStartPrice).to.not.be.null;
			expect(result.orderParams.auctionEndPrice).to.not.be.null;
		});
	});
});

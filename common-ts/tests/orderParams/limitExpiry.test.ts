import {
	BN,
	BASE_PRECISION,
	MarketType,
	PositionDirection,
	PRICE_PRECISION,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { buildNonMarketOrderParams } from '../../src/velocity/utils/orderParams';

describe('buildNonMarketOrderParams (limit expiry)', () => {
	const limit = (maxTs?: BN) =>
		buildNonMarketOrderParams({
			marketIndex: 0,
			marketType: MarketType.PERP,
			direction: PositionDirection.LONG,
			baseAssetAmount: BASE_PRECISION,
			orderConfig: {
				orderType: 'limit',
				limitPrice: new BN(100).mul(PRICE_PRECISION),
				maxTs,
			},
		});

	it('carries the expiry onto the order', () => {
		expect(limit(new BN(1_800_000_000)).maxTs?.toString()).to.equal(
			'1800000000'
		);
	});

	it('leaves an order without an expiry open-ended', () => {
		expect(limit().maxTs).to.equal(null);
	});
});

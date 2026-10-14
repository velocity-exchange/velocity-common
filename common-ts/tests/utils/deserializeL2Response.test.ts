import { expect } from 'chai';
import { deserializeL2Response } from '../../src/utils/orderbook';

describe('deserializeL2Response', () => {
	it('reads a null best price and spread as zero', () => {
		const deserialized = deserializeL2Response({
			asks: [],
			bids: [
				{
					price: '97000000',
					size: '1000000000',
					sources: { clob: '1000000000' },
				},
			],
			oracleData: { price: '98000000', slot: '1', confidence: '1' },
			markPrice: '98000000',
			bestBidPrice: '97000000',
			bestAskPrice: null,
			spreadPct: null,
			spreadQuote: null,
			slot: 1,
			marketSlot: 1,
			marketType: 'perp',
			marketIndex: 0,
			marketName: 'SOL-PERP',
		} as never);

		expect(deserialized.bestAskPrice.toString()).to.equal('0');
		expect(deserialized.spreadPct.toString()).to.equal('0');
		expect(deserialized.spreadQuote.toString()).to.equal('0');
		expect(deserialized.bestBidPrice.toString()).to.equal('97000000');
	});
});

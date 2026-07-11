import { expect } from 'chai';
import {
	mapAuctionParamsResponseMeta,
	ServerAuctionParamsResponse,
} from '../../src/drift/utils/auctionParamsResponseMapper';

describe('mapAuctionParamsResponseMeta', () => {
	it('normalizes the native fraction slippageTolerance to a percentage', () => {
		const result = mapAuctionParamsResponseMeta({
			params: {},
			slippageTolerance: '0.005',
		} as ServerAuctionParamsResponse['data']);

		expect(result.slippage).to.equal(0.5);
	});

	it('leaves slippage undefined when the server omits slippageTolerance', () => {
		const result = mapAuctionParamsResponseMeta({
			params: {},
		} as ServerAuctionParamsResponse['data']);

		expect(result.slippage).to.be.undefined;
	});

	it('maps priceImpact fields to BN, using the same fraction*PRICE_PRECISION units as the L2 tier', () => {
		const result = mapAuctionParamsResponseMeta({
			params: {},
			entryPrice: '101200000',
			bestPrice: '100000000',
			worstPrice: '102000000',
			oraclePrice: '100000000',
			markPrice: '100000000',
			priceImpact: 0.012,
		} as ServerAuctionParamsResponse['data']);

		expect(result.priceImpact?.entryPrice.toString()).to.equal('101200000');
		expect(result.priceImpact?.bestPrice.toString()).to.equal('100000000');
		expect(result.priceImpact?.worstPrice.toString()).to.equal('102000000');
		expect(result.priceImpact?.oraclePrice.toString()).to.equal('100000000');
		expect(result.priceImpact?.markPrice.toString()).to.equal('100000000');
		expect(result.priceImpact?.priceImpact.toString()).to.equal('12000');
	});

	it('leaves priceImpact undefined when the server omits entryPrice or priceImpact', () => {
		const missingEntryPrice = mapAuctionParamsResponseMeta({
			params: {},
			priceImpact: 0.012,
		} as ServerAuctionParamsResponse['data']);
		expect(missingEntryPrice.priceImpact).to.be.undefined;

		const missingPriceImpact = mapAuctionParamsResponseMeta({
			params: {},
			entryPrice: '101200000',
		} as ServerAuctionParamsResponse['data']);
		expect(missingPriceImpact.priceImpact).to.be.undefined;
	});
});

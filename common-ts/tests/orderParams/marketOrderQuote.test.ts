import {
	BN,
	OrderType,
	OrderTriggerCondition,
	PositionDirection,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { deserializeMarketOrderQuote } from '../../src/velocity/base/actions/trade/openPerpOrder/dlobServer';
import { bracketTriggerOrderParams } from '../../src/velocity/base/actions/trade/openPerpOrder/triggerOrders';
import { ENUM_UTILS } from '../../src';

/** The `data` object `GET /marketOrderParams` returns, as dlob-server serializes it. */
const response = (params: Record<string, unknown>) => ({
	params: {
		orderType: 'market',
		marketType: 'perp',
		marketIndex: 0,
		direction: 'long',
		baseAssetAmount: '1000000000',
		price: '161650500',
		oraclePriceOffset: null,
		reduceOnly: false,
		userOrderId: null,
		activationDelaySlots: null,
		maxTs: null,
		...params,
	},
	entryPrice: '160050000',
	bestPrice: '160040000',
	worstPrice: '160060000',
	oraclePrice: '160000000',
	markPrice: '160010000',
	priceImpact: 0.0003,
	slippageTolerance: 1,
	generatedAt: 1790000000000,
});

describe('deserializeMarketOrderQuote', () => {
	it('names the worst price as the order price and keeps the book delay', () => {
		const quote = deserializeMarketOrderQuote(response({}));

		expect(ENUM_UTILS.match(quote.orderParams.orderType, OrderType.MARKET)).to
			.be.true;
		expect(quote.orderParams.price.toString()).to.equal('161650500');
		expect(quote.orderParams.activationDelaySlots).to.equal(null);
		expect(quote.orderParams.oraclePriceOffset).to.equal(null);
		expect(quote.entryPrice.toString()).to.equal('160050000');
		expect(quote.slippageTolerance).to.equal(1);
	});

	it('reads an oracle order as an offset from the oracle', () => {
		const quote = deserializeMarketOrderQuote(
			response({
				orderType: 'oracle',
				price: '0',
				oraclePriceOffset: '1650500',
			})
		);

		expect(ENUM_UTILS.match(quote.orderParams.orderType, OrderType.ORACLE)).to
			.be.true;
		expect(quote.orderParams.oraclePriceOffset?.toString()).to.equal('1650500');
	});
});

describe('bracketTriggerOrderParams', () => {
	it('arms reduce-only triggers on the side that closes the entry', () => {
		const brackets = bracketTriggerOrderParams({
			marketIndex: 0,
			entryDirection: PositionDirection.LONG,
			entryBaseAssetAmount: new BN(10),
			bracketOrders: {
				takeProfit: { triggerPrice: new BN(110) },
				stopLoss: { triggerPrice: new BN(90), limitPrice: new BN(89) },
			},
		});

		expect(brackets).to.have.length(2);
		const [takeProfit, stopLoss] = brackets;
		expect(ENUM_UTILS.match(takeProfit.direction, PositionDirection.SHORT)).to
			.be.true;
		expect(ENUM_UTILS.match(takeProfit.orderType, OrderType.TRIGGER_MARKET)).to
			.be.true;
		expect(ENUM_UTILS.match(stopLoss.orderType, OrderType.TRIGGER_LIMIT)).to.be
			.true;
		expect(takeProfit.reduceOnly).to.be.true;
		expect(takeProfit.baseAssetAmount.toNumber()).to.equal(10);
		expect(
			ENUM_UTILS.match(stopLoss.triggerCondition, OrderTriggerCondition.BELOW)
		).to.be.true;
	});

	it('arms nothing without brackets', () => {
		expect(
			bracketTriggerOrderParams({
				marketIndex: 0,
				entryDirection: PositionDirection.LONG,
				entryBaseAssetAmount: new BN(10),
			})
		).to.deep.equal([]);
	});
});

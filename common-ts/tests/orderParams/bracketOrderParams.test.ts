import {
	BN,
	MarketType,
	OrderTriggerCondition,
	OrderType,
	PositionDirection,
	PRICE_PRECISION,
} from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { buildNonMarketOrderParams } from '../../src/drift/utils/orderParams';
import { ENUM_UTILS } from '../../src';

// Bracket orders are built by callers with `direction` already flipped to the
// closing side (opposite of the position direction) - buildNonMarketOrderParams
// itself just takes that direction and derives the trigger condition from it.
describe('buildNonMarketOrderParams (bracket orders)', () => {
	const marketIndex = 0;
	const marketType = MarketType.PERP;
	const baseAssetAmount = new BN(1).mul(PRICE_PRECISION);

	describe('closing a LONG position (bracket direction SHORT)', () => {
		const direction = PositionDirection.SHORT;

		it('builds a take-profit order that triggers ABOVE', () => {
			const triggerPrice = new BN(110).mul(PRICE_PRECISION);

			const result = buildNonMarketOrderParams({
				marketIndex,
				marketType,
				direction,
				baseAssetAmount,
				reduceOnly: true,
				orderConfig: { orderType: 'takeProfit', triggerPrice },
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.TRIGGER_MARKET)
			);
			expect(result.triggerPrice?.toString()).to.equal(triggerPrice.toString());
			expect(ENUM_UTILS.toStr(result.direction)).to.equal(
				ENUM_UTILS.toStr(PositionDirection.SHORT)
			);
			expect(result.reduceOnly).to.be.true;
			expect(ENUM_UTILS.toStr(result.triggerCondition!)).to.equal(
				ENUM_UTILS.toStr(OrderTriggerCondition.ABOVE)
			);
		});

		it('builds a stop-loss order that triggers BELOW', () => {
			const triggerPrice = new BN(90).mul(PRICE_PRECISION);

			const result = buildNonMarketOrderParams({
				marketIndex,
				marketType,
				direction,
				baseAssetAmount,
				reduceOnly: true,
				orderConfig: { orderType: 'stopLoss', triggerPrice },
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.TRIGGER_MARKET)
			);
			expect(result.triggerPrice?.toString()).to.equal(triggerPrice.toString());
			expect(ENUM_UTILS.toStr(result.triggerCondition!)).to.equal(
				ENUM_UTILS.toStr(OrderTriggerCondition.BELOW)
			);
		});
	});

	describe('closing a SHORT position (bracket direction LONG)', () => {
		const direction = PositionDirection.LONG;

		it('builds a take-profit order that triggers BELOW', () => {
			const triggerPrice = new BN(90).mul(PRICE_PRECISION);

			const result = buildNonMarketOrderParams({
				marketIndex,
				marketType,
				direction,
				baseAssetAmount,
				reduceOnly: true,
				orderConfig: { orderType: 'takeProfit', triggerPrice },
			});

			expect(ENUM_UTILS.toStr(result.triggerCondition!)).to.equal(
				ENUM_UTILS.toStr(OrderTriggerCondition.BELOW)
			);
		});

		it('builds a stop-loss order that triggers ABOVE', () => {
			const triggerPrice = new BN(110).mul(PRICE_PRECISION);

			const result = buildNonMarketOrderParams({
				marketIndex,
				marketType,
				direction,
				baseAssetAmount,
				reduceOnly: true,
				orderConfig: { orderType: 'stopLoss', triggerPrice },
			});

			expect(ENUM_UTILS.toStr(result.triggerCondition!)).to.equal(
				ENUM_UTILS.toStr(OrderTriggerCondition.ABOVE)
			);
		});
	});

	it('builds a TRIGGER_LIMIT order when a limitPrice is supplied', () => {
		const triggerPrice = new BN(110).mul(PRICE_PRECISION);
		const limitPrice = new BN(109).mul(PRICE_PRECISION);

		const result = buildNonMarketOrderParams({
			marketIndex,
			marketType,
			direction: PositionDirection.SHORT,
			baseAssetAmount,
			reduceOnly: true,
			orderConfig: { orderType: 'takeProfit', triggerPrice, limitPrice },
		});

		expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
			ENUM_UTILS.toStr(OrderType.TRIGGER_LIMIT)
		);
		expect(result.price?.toString()).to.equal(limitPrice.toString());
	});
});

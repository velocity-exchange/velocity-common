import { BN, PRICE_PRECISION, PositionDirection } from '@velocity-exchange/sdk';
import { getMarketOrderLimitPrice } from '../../src/utils/trading';
import { expect } from 'chai';

describe('COMMON_UI_UTILS OrderParams Tests', () => {
	describe('getMarketOrderLimitPrice', () => {
		it('should use the correct price for a LONG with 5% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 5,
			});

			expect(result.toString()).to.equal('105000000');
		});

		it('should use the correct price for a SHORT with 5% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 5,
			});

			expect(result.toString()).to.equal('95000000');
		});
		it('should use the correct price for a LONG with 0.5% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.5,
			});

			expect(result.toString()).to.equal('100500000');
		});

		it('should use the correct price for a SHORT with 0.5% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.5,
			});

			expect(result.toString()).to.equal('99500000');
		});
		it('should use the correct price for a LONG with 0.05% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.05,
			});

			expect(result.toString()).to.equal('100050000');
		});

		it('should use the correct price for a SHORT with 0.05% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.05,
			});

			expect(result.toString()).to.equal('99950000');
		});
	});
});

import { expect } from 'chai';
import { getLiquidityPcts } from '../../src/utils/orderbook';

describe('getLiquidityPcts', () => {
	it('draws every source as resting, PropAMM included', () => {
		const pcts = getLiquidityPcts(200, { clob: 30, vamm: 50, propamm: 20 });

		expect(pcts.restingLiquidityPct).to.equal(50);
		expect(pcts.indicativeLiquidityPct).to.equal(0);
	});

	it('draws nothing for an empty level', () => {
		const pcts = getLiquidityPcts(200, {});

		expect(pcts.restingLiquidityPct).to.equal(0);
		expect(pcts.indicativeLiquidityPct).to.equal(0);
	});
});

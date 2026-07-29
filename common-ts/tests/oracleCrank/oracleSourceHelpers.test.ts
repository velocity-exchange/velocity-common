import { OracleSource } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import {
	isPythLazer,
	isPythOracle,
	isPullOracle,
} from '../../src/drift/base/actions/markets/oracleCrank/oracleSourceHelpers';

describe('Oracle Source Helpers', () => {
	describe('isPythLazer', () => {
		it('should return true for PYTH_LAZER variants', () => {
			expect(isPythLazer(OracleSource.PYTH_LAZER)).to.be.true;
			expect(isPythLazer(OracleSource.PYTH_LAZER_1K)).to.be.true;
			expect(isPythLazer(OracleSource.PYTH_LAZER_1M)).to.be.true;
			expect(isPythLazer(OracleSource.PYTH_LAZER_STABLE_COIN)).to.be.true;
		});

		it('should return false for non-PYTH_LAZER sources', () => {
			expect(isPythLazer(OracleSource.PYTH_PULL)).to.be.false;
			expect(isPythLazer(OracleSource.PYTH)).to.be.false;
		});
	});

	describe('isPythOracle', () => {
		it('should return true for all PYTH variants', () => {
			expect(isPythOracle(OracleSource.PYTH)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_1K)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_1M)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_STABLE_COIN)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_PULL)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_1K_PULL)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_1M_PULL)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_STABLE_COIN_PULL)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_LAZER)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_LAZER_1K)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_LAZER_1M)).to.be.true;
			expect(isPythOracle(OracleSource.PYTH_LAZER_STABLE_COIN)).to.be.true;
		});

		it('should return false for non-PYTH sources', () => {
			expect(isPythOracle(OracleSource.QUOTE_ASSET)).to.be.false;
		});
	});

	describe('isPullOracle', () => {
		it('should return true for all PULL and LAZER variants', () => {
			expect(isPullOracle(OracleSource.PYTH_PULL)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_1K_PULL)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_1M_PULL)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_STABLE_COIN_PULL)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_LAZER)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_LAZER_1K)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_LAZER_1M)).to.be.true;
			expect(isPullOracle(OracleSource.PYTH_LAZER_STABLE_COIN)).to.be.true;
		});

		it('should return false for legacy PYTH and non-PYTH sources', () => {
			expect(isPullOracle(OracleSource.PYTH)).to.be.false;
			expect(isPullOracle(OracleSource.PYTH_1K)).to.be.false;
			expect(isPullOracle(OracleSource.QUOTE_ASSET)).to.be.false;
		});
	});
});

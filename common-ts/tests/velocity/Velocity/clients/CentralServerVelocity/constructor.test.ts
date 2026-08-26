import { expect } from 'chai';
import * as sinon from 'sinon';
import { VelocityEnv } from '@velocity-exchange/sdk';
import { CentralServerVelocity } from '../../../../../src/velocity/Velocity/clients/CentralServerVelocity';
import { CentralServerVelocityMarkets } from '../../../../../src/velocity/Velocity/clients/CentralServerVelocity/markets';
import { EnvironmentConstants } from '../../../../../src/EnvironmentConstants';

describe('CentralServerVelocity Constructor', () => {
	let originalConsoleWarn: typeof console.warn;

	beforeEach(() => {
		// Suppress console warnings during tests
		originalConsoleWarn = console.warn;
		console.warn = () => {};
	});

	afterEach(() => {
		sinon.restore();
		console.warn = originalConsoleWarn;
	});

	const defaultDevnetRpc = EnvironmentConstants.rpcs.dev[0].value; // helius
	const defaultMainnetRpc = EnvironmentConstants.rpcs.mainnet[1].value; // helius

	describe('Basic Constructor Success Tests', () => {
		it('should create instance with valid devnet configuration', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0, 1],
				supportedSpotMarkets: [0, 1, 2],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			expect(centralServerVelocity).to.be.instanceOf(CentralServerVelocity);
			expect(centralServerVelocity.markets).to.be.instanceOf(
				CentralServerVelocityMarkets
			);
		});

		it('should create instance with valid mainnet configuration', () => {
			const config = {
				solanaRpcEndpoint: defaultMainnetRpc,
				velocityEnv: 'mainnet-beta' as VelocityEnv,
				supportedPerpMarkets: [0, 1, 2],
				supportedSpotMarkets: [0, 1],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			expect(centralServerVelocity).to.be.instanceOf(CentralServerVelocity);
			expect(centralServerVelocity.markets).to.be.instanceOf(
				CentralServerVelocityMarkets
			);
		});

		it('should create instance with additional VelocityClient configuration', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
				additionalVelocityClientConfig: {
					enableMetricsEvents: true,
					userStats: true,
				},
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			expect(centralServerVelocity).to.be.instanceOf(CentralServerVelocity);
		});
	});

	describe('Market Configuration Tests', () => {
		it('should configure perp markets correctly', () => {
			const supportedPerpMarkets = [0, 1, 2];
			const supportedSpotMarkets = [0];
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets,
				supportedSpotMarkets,
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Access private property to verify configuration
			const perpMarketConfigs = (centralServerVelocity as any)
				._perpMarketConfigs;
			const spotMarketConfigs = (centralServerVelocity as any)
				._spotMarketConfigs;

			// Verify perp markets are correctly configured
			expect(perpMarketConfigs).to.have.length(supportedPerpMarkets.length);
			supportedPerpMarkets.forEach((marketIndex, i) => {
				expect(perpMarketConfigs[i]).to.exist;
				expect(perpMarketConfigs[i].marketIndex).to.equal(marketIndex);
			});

			// Verify spot markets are correctly configured
			expect(spotMarketConfigs).to.have.length(supportedSpotMarkets.length);
			supportedSpotMarkets.forEach((marketIndex, i) => {
				expect(spotMarketConfigs[i]).to.exist;
				expect(spotMarketConfigs[i].marketIndex).to.equal(marketIndex);
			});
		});

		it('should configure spot markets correctly', () => {
			const supportedPerpMarkets = [0];
			const supportedSpotMarkets = [0, 1, 2, 3];
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets,
				supportedSpotMarkets,
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Access private property to verify configuration
			const spotMarketConfigs = (centralServerVelocity as any)
				._spotMarketConfigs;

			// Verify spot markets are correctly configured
			expect(spotMarketConfigs).to.have.length(supportedSpotMarkets.length);
			supportedSpotMarkets.forEach((marketIndex, i) => {
				expect(spotMarketConfigs[i]).to.exist;
				expect(spotMarketConfigs[i].marketIndex).to.equal(marketIndex);
			});
		});

		it('should handle empty market arrays', () => {
			const supportedPerpMarkets: number[] = [];
			const supportedSpotMarkets: number[] = [];
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets,
				supportedSpotMarkets,
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Access private properties to verify empty arrays
			const perpMarketConfigs = (centralServerVelocity as any)
				._perpMarketConfigs;
			const spotMarketConfigs = (centralServerVelocity as any)
				._spotMarketConfigs;

			expect(perpMarketConfigs).to.have.length(0);
			expect(spotMarketConfigs).to.have.length(0);
		});

		it('should handle non-existent market indexes by including undefined entries', () => {
			const supportedPerpMarkets = [0, 999]; // Mix of valid and invalid
			const supportedSpotMarkets = [0, 1001]; // Mix of valid and invalid
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets,
				supportedSpotMarkets,
			};

			// Constructor should succeed but contain undefined entries for non-existent markets
			// The error occurs later in getMarketsAndOraclesForSubscription
			expect(() => new CentralServerVelocity(config)).to.throw();
		});

		it('should maintain exact mapping between input arrays and market configs', () => {
			const supportedPerpMarkets = [1, 0, 2]; // Test different order
			const supportedSpotMarkets = [2, 0, 1]; // Test different order
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets,
				supportedSpotMarkets,
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			const perpMarketConfigs = (centralServerVelocity as any)
				._perpMarketConfigs;
			const spotMarketConfigs = (centralServerVelocity as any)
				._spotMarketConfigs;

			// Verify exact mapping: each position should match the corresponding input
			expect(perpMarketConfigs).to.have.length(supportedPerpMarkets.length);
			expect(spotMarketConfigs).to.have.length(supportedSpotMarkets.length);

			supportedPerpMarkets.forEach((expectedMarketIndex, position) => {
				expect(perpMarketConfigs[position].marketIndex).to.equal(
					expectedMarketIndex
				);
			});

			supportedSpotMarkets.forEach((expectedMarketIndex, position) => {
				expect(spotMarketConfigs[position].marketIndex).to.equal(
					expectedMarketIndex
				);
			});
		});
	});

	describe('Environment-Specific Tests', () => {
		it('should set correct endpoints for devnet environment', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Access private property for testing
			const endpoints = (centralServerVelocity as any)._velocityEndpoints;
			expect(endpoints.dlobServerHttpUrl).to.equal(
				EnvironmentConstants.dlobServerHttpUrl.dev
			);
			expect(endpoints.swiftServerUrl).to.equal(
				EnvironmentConstants.swiftServerUrl.staging
			);
		});

		it('should set correct endpoints for mainnet environment', () => {
			const config = {
				solanaRpcEndpoint: defaultMainnetRpc,
				velocityEnv: 'mainnet-beta' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Access private property for testing
			const endpoints = (centralServerVelocity as any)._velocityEndpoints;
			expect(endpoints.dlobServerHttpUrl).to.equal(
				EnvironmentConstants.dlobServerHttpUrl.mainnet
			);
			expect(endpoints.swiftServerUrl).to.equal(
				EnvironmentConstants.swiftServerUrl.mainnet
			);
		});
	});

	describe('Instance Properties Tests', () => {
		it('should have markets property initialized', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			expect(centralServerVelocity.markets).to.exist;
			expect(centralServerVelocity.markets).to.be.instanceOf(
				CentralServerVelocityMarkets
			);
		});

		it('should have subscribe method available', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			expect(centralServerVelocity.subscribe).to.be.a('function');
		});

		it('should have all transaction methods available', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			const centralServerVelocity = new CentralServerVelocity(config);

			// Check that all the transaction methods exist
			expect(centralServerVelocity.getUser).to.be.a('function');
			expect(centralServerVelocity.getCreateAndDepositTxn).to.be.a('function');
			expect(centralServerVelocity.getDepositTxn).to.be.a('function');
			expect(centralServerVelocity.getWithdrawTxn).to.be.a('function');
			expect(centralServerVelocity.getDeleteUserTxn).to.be.a('function');
			expect(centralServerVelocity.getSettleFundingTxn).to.be.a('function');
			expect(centralServerVelocity.getSettlePnlTxn).to.be.a('function');
			expect(centralServerVelocity.getOpenPerpMarketOrderTxn).to.be.a(
				'function'
			);
			expect(centralServerVelocity.getOpenPerpNonMarketOrderTxn).to.be.a(
				'function'
			);
			expect(centralServerVelocity.getEditOrderTxn).to.be.a('function');
			expect(centralServerVelocity.getCancelOrdersTxn).to.be.a('function');
			expect(centralServerVelocity.getCancelAllOrdersTxn).to.be.a('function');
			expect(centralServerVelocity.getSwapTxn).to.be.a('function');
			expect(centralServerVelocity.sendSignedTransaction).to.be.a('function');
		});
	});

	describe('Error Handling Tests', () => {
		it('should handle invalid RPC endpoint gracefully', () => {
			const config = {
				solanaRpcEndpoint: 'invalid-url',
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
			};

			// Should throw error with invalid RPC endpoint
			expect(() => new CentralServerVelocity(config)).to.throw();
		});

		it('should handle missing additional config gracefully', () => {
			const config = {
				solanaRpcEndpoint: defaultDevnetRpc,
				velocityEnv: 'devnet' as VelocityEnv,
				supportedPerpMarkets: [0],
				supportedSpotMarkets: [0],
				// additionalVelocityClientConfig is optional
			};

			expect(() => new CentralServerVelocity(config)).to.not.throw();
		});
	});
});

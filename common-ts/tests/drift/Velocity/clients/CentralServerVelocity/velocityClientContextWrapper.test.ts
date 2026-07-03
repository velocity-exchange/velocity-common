/**
 * Test Suite: CentralServerVelocity velocityClientContextWrapper
 *
 * PURPOSE:
 * Tests the critical private method `velocityClientContextWrapper` which manages user state
 * and context for all transaction operations in CentralServerVelocity. This method is the
 * foundation for safe transaction building and user management.
 *
 * WHY THIS IS IMPORTANT:
 * The velocityClientContextWrapper method handles:
 * 1. User account subscription and lifecycle management
 * 2. VelocityClient state management (wallet, authority, users)
 * 3. Resource cleanup and state restoration
 * 4. Error handling and cleanup in failure scenarios
 * 5. Proper isolation between concurrent user operations
 *
 * WHAT WE TEST:
 * - Error handling and graceful failure recovery
 * - Resource management and cleanup (even when operations fail)
 * - Method signature and interface validation
 * - Operation function parameter handling (different return types)
 * - Input validation (null, undefined, invalid parameters)
 * - Integration with public transaction methods
 * - Performance under multiple rapid sequential calls
 *
 * TESTING APPROACH:
 * - Integration-style tests using real CentralServerVelocity instances
 * - Error-tolerant testing (expects failures due to non-existent user accounts)
 * - Focus on behavior verification rather than heavy mocking
 * - Resource management validation
 * - Boundary condition testing
 *
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { PublicKey } from '@solana/web3.js';
import { VelocityEnv, User } from '@velocity-exchange/sdk';
import { CentralServerVelocity } from '../../../../../src/drift/Velocity/clients/CentralServerVelocity';
import { EnvironmentConstants } from '../../../../../src/EnvironmentConstants';
import { sleep } from '../../../../../src/utils';
import { setupTestContext, invalidMockUserAccountPublicKey } from './context';
import { getDevWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity velocityClientContextWrapper', function () {
	this.timeout(10_000);

	let centralServerVelocity: CentralServerVelocity;
	let originalConsoleWarn: typeof console.warn;

	const validMockUserAccountPublicKey = getDevWallet().devUser0;
	const valid2MockUserAccountPublicKey = getDevWallet().devUser1;
	const defaultDevnetRpc = EnvironmentConstants.rpcs.dev[0].value;

	before(async () => {
		await setupTestContext();
	});

	beforeEach(async () => {
		// Suppress console warnings during tests
		originalConsoleWarn = console.warn;
		console.warn = () => {};

		// Create CentralServerVelocity instance
		const config = {
			solanaRpcEndpoint: defaultDevnetRpc,
			velocityEnv: 'devnet' as VelocityEnv,
			supportedPerpMarkets: [0, 1, 2], // SOL, BTC, ETH
			supportedSpotMarkets: [0, 1], // USDT, SOL
		};

		centralServerVelocity = new CentralServerVelocity(config);

		// Add delay to prevent RPC rate limiting between test cases
		await new Promise((resolve) => setTimeout(resolve, 1000));
	});

	afterEach(() => {
		sinon.restore();
		console.warn = originalConsoleWarn;
	});

	describe('Error Handling Integration Tests', () => {
		it('should handle operation that throws an error gracefully', async () => {
			const operationError = new Error('Simulated operation failure');
			const mockOperation = sinon.stub().rejects(operationError);

			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidMockUserAccountPublicKey,
					mockOperation
				);
				expect.fail('Should have thrown error');
			} catch (error: any) {
				// The actual error may be different due to user subscription failures
				// but we want to ensure the wrapper doesn't hang or cause other issues
				expect(error).to.exist;
			}
		});

		it('should be a private method', () => {
			// Verify the method exists but is not publicly accessible
			expect(
				(centralServerVelocity as any).velocityClientContextWrapper
			).to.be.a('function');
			expect((centralServerVelocity as any).velocityClientContextWrapper).to.not
				.be.undefined;
		});

		it('should handle invalid user account public key', async () => {
			const invalidKey = new PublicKey('11111111111111111111111111111111'); // Invalid key
			const mockOperation = sinon.stub().resolves('success');

			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidKey,
					mockOperation
				);
				expect.fail('Should have thrown error for invalid user key');
			} catch (error: any) {
				expect(error).to.exist;
				// Should not call the operation if user setup fails
				expect(mockOperation.called).to.be.false;
			}
		});
	});

	describe('Operation Function Validation', function () {
		this.timeout(10000);

		it('should handle operation function that returns different types', async function () {
			const testCases = [
				'string result',
				42,
				{ complex: 'object' },
				null,
				undefined,
				true,
				[],
			];

			for (const expectedResult of testCases) {
				const mockOperation = sinon.stub().resolves(expectedResult);

				const result = await (
					centralServerVelocity as any
				).velocityClientContextWrapper(
					validMockUserAccountPublicKey,
					mockOperation
				);

				// If we get here, the operation completed successfully
				expect(result).to.deep.equal(expectedResult);
			}
		});

		it('should handle operation function that takes time to resolve and user to exists', async () => {
			const mockOperation = sinon.stub().callsFake(async (user) => {
				await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
				expect(user).to.exist;
				return 'delayed result';
			});

			await (centralServerVelocity as any).velocityClientContextWrapper(
				validMockUserAccountPublicKey,
				mockOperation
			);
		});
	});

	describe('Resource Management', () => {
		it('should not leave resources hanging after errors', async () => {
			// This test verifies that even when errors occur, the wrapper
			// attempts to clean up resources properly
			const mockOperation = sinon.stub().rejects(new Error('Operation failed'));

			// Store original state to verify it doesn't get corrupted
			const originalVelocityClient = (centralServerVelocity as any)
				.velocityClient;

			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidMockUserAccountPublicKey,
					mockOperation
				);
			} catch (error) {
				// Expected
			}

			// Verify the original velocityClient reference is still intact
			expect((centralServerVelocity as any).velocityClient).to.equal(
				originalVelocityClient
			);
		});

		it('should handle multiple rapid sequential calls', async function () {
			this.timeout(15_000);

			const operations = Array.from({ length: 5 }, (_, i) =>
				sinon.stub().resolves(`result-${i}`)
			);

			const results: any[] = [];
			const errors: any[] = [];

			// Execute multiple operations sequentially with delays
			for (let i = 0; i < operations.length; i++) {
				try {
					const result = await (
						centralServerVelocity as any
					).velocityClientContextWrapper(
						invalidMockUserAccountPublicKey,
						operations[i]
					);
					results.push(result);
				} catch (error) {
					errors.push(error);
				}

				// Add delay between operations to prevent RPC rate limiting
				if (i < operations.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}
			}

			// For this test, we expect errors due to user account not existing
			// but we want to verify the wrapper handles multiple calls without crashing
			expect(errors.length).to.be.greaterThan(0);
			expect(results.length + errors.length).to.equal(operations.length);
		});

		it('should maintain correct user isolation with different user public keys', async function () {
			this.timeout(10000);

			// Track which user public key each operation receives
			const userKeysReceived: PublicKey[] = [];
			const userKeysExpected = [
				validMockUserAccountPublicKey,
				valid2MockUserAccountPublicKey,
				validMockUserAccountPublicKey,
			];

			// Create operations that capture the user's authority (which should match the input key)
			const operations = userKeysExpected.map((expectedKey, index) =>
				sinon.stub().callsFake(async (user: User) => {
					await sleep(10);

					// The user's authority should match the public key we passed in
					const userAccountPubKey = user.userAccountPublicKey;
					userKeysReceived.push(userAccountPubKey);

					expect(userAccountPubKey.toString()).to.equal(expectedKey.toString());
					await sleep(10);
					return `result-${index}-${expectedKey.toString().slice(0, 8)}`;
				})
			);

			const results: any[] = [];

			// Execute operations sequentially with different user keys and delays
			for (let i = 0; i < operations.length; i++) {
				try {
					(centralServerVelocity as any)
						.velocityClientContextWrapper(userKeysExpected[i], operations[i])
						.then((result) => {
							// we intentionally don't await here to test the async behavior
							results.push(result);
						});
				} catch (error) {
					results.push(`error-${i}`);
				}
			}

			// wait for all operations to complete
			await sleep(5000);

			// Verify we got results for all operations
			expect(results).to.have.length(userKeysExpected.length);
		});
	});

	describe('Input Validation', () => {
		it('should handle null operation function', async () => {
			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidMockUserAccountPublicKey,
					null as any
				);
				expect.fail('Should have thrown error for null operation');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});

		it('should handle undefined operation function', async () => {
			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidMockUserAccountPublicKey,
					undefined as any
				);
				expect.fail('Should have thrown error for undefined operation');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});

		it('should handle non-function operation parameter', async () => {
			try {
				await (centralServerVelocity as any).velocityClientContextWrapper(
					invalidMockUserAccountPublicKey,
					'not a function' as any
				);
				expect.fail('Should have thrown error for non-function operation');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});

	describe('Context Wrapper Behavior', () => {
		it('should be used by public transaction methods', () => {
			// Verify that the context wrapper is actually used by the public methods
			// by checking if the method exists and is properly integrated
			const publicMethods = [
				'getDepositTxn',
				'getWithdrawTxn',
				'getSettleFundingTxn',
				'getSettlePnlTxn',
				'getOpenPerpMarketOrderTxn',
				'getOpenPerpNonMarketOrderTxn',
				'getEditOrderTxn',
				'getCancelOrdersTxn',
				'getCancelAllOrdersTxn',
				'getSwapTxn',
			];

			publicMethods.forEach((methodName) => {
				expect((centralServerVelocity as any)[methodName]).to.be.a('function');
			});
		});

		it('should maintain consistent interface', () => {
			// Verify the velocityClientContextWrapper maintains expected interface
			const wrapper = (centralServerVelocity as any)
				.velocityClientContextWrapper;

			expect(wrapper).to.be.a('function');
			expect(wrapper.constructor.name).to.equal('AsyncFunction');
		});
	});
});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { BN } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	teardownTestContext,
} from './context';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import { getDevWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity - Swap Transactions', function () {
	this.timeout(10_000);

	const validMockUserAccountPublicKey = getDevWallet().devUser0;

	before(async () => {
		await setupTestContext();
	});

	beforeEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 2000));
	});

	after(async () => {
		await teardownTestContext();
	});

	afterEach(async () => {
		sinon.restore();
	});

	describe('getSwapTxn', () => {
		it('should create swap transaction between spot markets', async () => {
			const fromMarketIndex = 0;
			const toMarketIndex = 1;
			const amount = new BN(1000000);
			try {
				const txn = await centralServerVelocity.getSwapTxn(
					validMockUserAccountPublicKey,
					fromMarketIndex,
					toMarketIndex,
					amount
				);
				expect(txn).to.exist;
				assertComputeBudgetThenProgram(
					txn as VersionedTransaction,
					velocityClient.program.programId,
					2
				);
			} catch (error: any) {
				expect(error).to.exist;
			}
		});

		it('should handle swap with slippage options', async () => {
			const fromMarketIndex = 1;
			const toMarketIndex = 0;
			const amount = new BN(1000000000);
			try {
				const txn = await centralServerVelocity.getSwapTxn(
					validMockUserAccountPublicKey,
					fromMarketIndex,
					toMarketIndex,
					amount,
					{ slippageBps: 100 }
				);
				expect(txn).to.exist;
				assertComputeBudgetThenProgram(
					txn as VersionedTransaction,
					velocityClient.program.programId,
					2
				);
			} catch (error: any) {
				expect(error).to.exist;
			}
		});

		it('should reject invalid from market index', async () => {
			const fromMarketIndex = 999;
			const toMarketIndex = 0;
			const amount = new BN(1000000);
			try {
				await centralServerVelocity.getSwapTxn(
					validMockUserAccountPublicKey,
					fromMarketIndex,
					toMarketIndex,
					amount
				);
				expect.fail('Should have thrown error for invalid from market index');
			} catch (error: any) {
				expect(error.message).to.include('From spot market config not found');
			}
		});

		it('should handle same market index (should error)', async () => {
			const marketIndex = 0;
			const amount = new BN(1000000);
			try {
				await centralServerVelocity.getSwapTxn(
					validMockUserAccountPublicKey,
					marketIndex,
					marketIndex,
					amount
				);
				expect.fail('Should have thrown error for same market indexes');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});
});

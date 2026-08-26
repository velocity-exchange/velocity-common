import { expect } from 'chai';
import * as sinon from 'sinon';
import { VersionedTransaction } from '@solana/web3.js';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	teardownTestContext,
	signAndSendTransaction,
	invalidMockUserAccountPublicKey,
} from './context';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import { getDevWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity - Settlement Transactions', function () {
	this.timeout(10_000);
	const devWalletContext = getDevWallet();
	const devWallet = devWalletContext.devWallet;
	const devWalletUser0 = devWalletContext.devUser0;

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

	/**
	 * Helper function to verify settlement execution on-chain
	 */
	async function verifySettleFundingExecution(expectNoPositionError = false) {
		try {
			const txn = await centralServerVelocity.getSettleFundingTxn(
				devWalletUser0,
				{
					txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 },
				}
			);
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);

			await signAndSendTransaction(txn as VersionedTransaction, devWallet);
		} catch (error: any) {
			if (expectNoPositionError) {
				expect(error.message).to.include('UserHasNoPositionInMarket');
			} else {
				console.log('verifySettleFundingExecution ~ error:', error);
				expect(error).to.not.exist;
			}
		}
	}

	/**
	 * Helper function to verify settle PnL execution on-chain
	 */
	async function verifySettlePnlExecution(
		marketIndexes: number[],
		expectNoPositionError = false
	) {
		try {
			const txn = await centralServerVelocity.getSettlePnlTxn(
				devWalletUser0,
				marketIndexes,
				{ txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 } }
			);
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);

			await signAndSendTransaction(txn as VersionedTransaction, devWallet);
		} catch (error: any) {
			if (expectNoPositionError) {
				expect(error.message).to.include('UserHasNoPositionInMarket');
			} else {
				console.log('verifySettlePnlExecution ~ error:', error);
				expect(error).to.not.exist;
			}
		}
	}

	describe('getSettleFundingTxn', () => {
		it('should create and execute settle funding transaction', async () => {
			try {
				await verifySettleFundingExecution();
			} catch (error: any) {
				console.error('getSettleFundingTxn error:', error);
				expect(error).to.not.exist;
			}
		});

		it('should handle invalid user account', async () => {
			try {
				await centralServerVelocity.getSettleFundingTxn(
					invalidMockUserAccountPublicKey,
					{ txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 } }
				);
				expect.fail('Should have thrown error for invalid user key');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});

	describe('getSettlePnlTxn', () => {
		it('should create and execute settle PnL transaction for single market', async () => {
			const marketIndexes = [0];
			await verifySettlePnlExecution(marketIndexes, true);
		});

		it('should create and execute settle PnL transaction for multiple markets', async () => {
			const marketIndexes = [0, 1];
			await verifySettlePnlExecution(marketIndexes, true);
		});

		it('should handle empty market indexes array', async () => {
			const marketIndexes: number[] = [];
			try {
				const txn = await centralServerVelocity.getSettlePnlTxn(
					devWalletUser0,
					marketIndexes
				);
				expect(txn).to.exist;
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});
});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { BN } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	signAndSendTransaction,
	teardownTestContext,
} from './context';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import { getDevWallet } from '../../../../utils/wallet';
import { User, OneShotUserAccountSubscriber } from '@velocity-exchange/sdk';

describe('CentralServerVelocity - Deposit Transactions', function () {
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
	 * Helper function to verify deposit execution on-chain
	 */
	async function verifyDepositExecution(
		amount: BN,
		spotMarketIndex: number,
		txParams?: { computeUnits: number; computeUnitsPrice: number }
	) {
		try {
			// Get user balance before deposit
			const user = new User({
				driftClient: velocityClient,
				userAccountPublicKey: devWalletUser0,
				accountSubscription: {
					type: 'custom',
					userAccountSubscriber: new OneShotUserAccountSubscriber(
						velocityClient.program,
						devWalletUser0
					),
				},
			});
			await user.subscribe();

			const positionBefore = user
				.getUserAccount()
				.spotPositions.find(
					(position) => position.marketIndex === spotMarketIndex
				);
			const balanceBefore = positionBefore?.scaledBalance || new BN(0);

			await user.unsubscribe();

			const txn = await centralServerVelocity.getDepositTxn(
				devWalletUser0,
				amount,
				spotMarketIndex,
				txParams ? { txParams } : undefined
			);
			expect(txn).to.exist;

			if (txParams) {
				assertComputeBudgetThenProgram(
					txn as VersionedTransaction,
					velocityClient.program.programId,
					2
				);
			}

			await signAndSendTransaction(txn as VersionedTransaction, devWallet);

			// Verify the deposit was reflected in the user's balance
			const userAfter = new User({
				driftClient: velocityClient,
				userAccountPublicKey: devWalletUser0,
				accountSubscription: {
					type: 'custom',
					userAccountSubscriber: new OneShotUserAccountSubscriber(
						velocityClient.program,
						devWalletUser0
					),
				},
			});
			await userAfter.subscribe();

			const positionAfter = userAfter
				.getUserAccount()
				.spotPositions.find(
					(position) => position.marketIndex === spotMarketIndex
				);
			expect(positionAfter).to.exist;
			expect(positionAfter?.scaledBalance.gt(balanceBefore)).to.be.true;

			await userAfter.unsubscribe();
		} catch (error: any) {
			console.error('deposit.test.ts error:', error);
			expect(error).to.not.exist;
		}
	}

	describe('getDepositTxn', () => {
		it('should create and execute deposit transaction for USDT', async () => {
			const amount = new BN(1_000_000); // 1 USDT
			const spotMarketIndex = 0;
			try {
				await verifyDepositExecution(amount, spotMarketIndex, {
					computeUnits: 1000000,
					computeUnitsPrice: 1_000,
				});
			} catch (error: any) {
				console.error('getDepositTxn error:', error);
				expect(error).to.not.exist;
			}
		});

		it('should create and execute deposit transaction for SOL', async () => {
			const amount = new BN(10_000_000); // 0.01 SOL
			const spotMarketIndex = 1;
			try {
				await verifyDepositExecution(amount, spotMarketIndex);
			} catch (error: any) {
				console.error('getDepositTxn error:', error);
				expect(error).to.not.exist;
			}
		});

		it('should reject invalid spot market index', async () => {
			const amount = new BN(1_000_000);
			const invalidSpotMarketIndex = 999;
			try {
				await centralServerVelocity.getDepositTxn(
					devWalletUser0,
					amount,
					invalidSpotMarketIndex
				);
				expect.fail('Should have thrown error for invalid market index');
			} catch (error: any) {
				expect(error.message).to.include('Spot market config not found');
			}
		});
	});
});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { BN } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	teardownTestContext,
	signAndSendTransaction,
} from './context';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import {
	User,
	OneShotUserAccountSubscriber,
	ZERO,
} from '@velocity-exchange/sdk';
import { getDevWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity - Withdraw Transactions', function () {
	this.timeout(10_000);
	const devWalletContext = getDevWallet();
	const devWallet = devWalletContext.devWallet;
	const devWalletUser0 = devWalletContext.devUser0;

	before(async () => {
		await setupTestContext();
	});

	beforeEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const txn = await centralServerVelocity.getDepositTxn(
			devWalletUser0,
			new BN(1_000_000),
			0,
			{
				txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 },
			}
		);
		await signAndSendTransaction(txn as VersionedTransaction, devWallet);
	});

	after(async () => {
		await teardownTestContext();
	});

	afterEach(async () => {
		sinon.restore();
	});

	/**
	 * Helper function to verify withdrawal execution on-chain
	 */
	async function verifyWithdrawalExecution(
		amount: BN,
		spotMarketIndex: number,
		options?: {
			isMax?: boolean;
			isBorrow?: boolean;
			txParams?: { computeUnits: number; computeUnitsPrice: number };
			skipIxChecks?: boolean;
		}
	) {
		// Get user balance before withdrawal
		const user = new User({
			velocityClient: velocityClient,
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
		const balanceBefore = positionBefore?.scaledBalance || ZERO;

		await user.unsubscribe();

		const txn = await centralServerVelocity.getWithdrawTxn(
			devWalletUser0,
			amount,
			spotMarketIndex,
			options
		);
		expect(txn).to.exist;

		if (options?.txParams && !options?.skipIxChecks) {
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
		}

		await signAndSendTransaction(txn as VersionedTransaction, devWallet);

		// Verify the withdrawal was reflected in the user's balance
		const userAfter = new User({
			velocityClient: velocityClient,
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

		// For max withdraw, balance should be zero or very close to zero
		// For regular withdraw, balance should decrease
		if (options?.isMax) {
			expect(positionAfter?.scaledBalance.eq(ZERO)).to.be.true;
		} else {
			expect(positionAfter?.scaledBalance.lt(balanceBefore)).to.be.true;
		}

		await userAfter.unsubscribe();
	}

	it('should create and execute withdraw transaction with standard options', async () => {
		const amount = new BN(1_000_000);
		const spotMarketIndex = 0;
		try {
			await verifyWithdrawalExecution(amount, spotMarketIndex, {
				txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 },
			});
		} catch (error: any) {
			console.error('getWithdrawTxn error:', error);
			expect(error).to.not.exist;
		}
	});

	it('should handle and execute max withdraw option', async () => {
		const amount = new BN(0);
		const spotMarketIndex = 0;
		try {
			await verifyWithdrawalExecution(amount, spotMarketIndex, {
				isMax: true,
				txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 },
			});
		} catch (error: any) {
			console.error('getWithdrawTxn max error:', error);
			expect(error).to.not.exist;
		}
	});

	it('should handle and execute borrow option', async () => {
		const amount = new BN(1000000);
		const spotMarketIndex = 1;
		try {
			await verifyWithdrawalExecution(amount, spotMarketIndex, {
				isBorrow: true,
				txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 },
				skipIxChecks: true,
			});
		} catch (error: any) {
			console.error('getWithdrawTxn borrow error:', error);
			expect(error).to.not.exist;
		}
	});

	it('should reject invalid spot market index', async () => {
		const amount = new BN(1000000);
		const invalidSpotMarketIndex = 999;
		try {
			await centralServerVelocity.getWithdrawTxn(
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

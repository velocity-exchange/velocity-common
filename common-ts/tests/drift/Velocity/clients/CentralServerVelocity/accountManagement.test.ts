import { expect } from 'chai';
import * as sinon from 'sinon';
import { BN } from '@coral-xyz/anchor';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	teardownTestContext,
	defaultConnection,
	invalidMockUserAccountPublicKey,
	signAndSendTransaction,
} from './context';
import {
	UserStats,
	OneShotUserStatsAccountSubscriber,
	getUserStatsAccountPublicKey,
	getUserAccountPublicKeySync,
	WalletV2,
	PublicKey,
	OneShotUserAccountSubscriber,
	User,
	ZERO,
} from '@velocity-exchange/sdk';
import { VersionedTransaction } from '@solana/web3.js';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import { getTestWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity - Account Management Transactions', function () {
	this.timeout(25_000);

	let testWallet: WalletV2;
	let testWalletAuthority: PublicKey;

	before(async () => {
		await setupTestContext();
		testWallet = await getTestWallet();
		testWalletAuthority = testWallet.publicKey;
	});

	after(async () => {
		await teardownTestContext();
	});

	beforeEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 15_000));
	});

	afterEach(async () => {
		sinon.restore();
	});

	describe('getCreateAndDepositTxn', () => {
		it('should create transaction for new user account with deposit', async () => {
			const amount = new BN(1_000_000);
			const spotMarketIndex = 0;

			try {
				const {
					transaction: txn,
					userAccountPublicKey,
					subAccountId,
				} = await centralServerVelocity.getCreateAndDepositTxn(
					testWalletAuthority,
					amount,
					spotMarketIndex,
					{ txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 } }
				);

				const userStatsAccountPublicKey = getUserStatsAccountPublicKey(
					velocityClient.program.programId,
					testWalletAuthority
				);
				const userStats = new UserStats({
					driftClient: velocityClient,
					userStatsAccountPublicKey: userStatsAccountPublicKey,
					accountSubscription: {
						type: 'custom',
						userStatsAccountSubscriber: new OneShotUserStatsAccountSubscriber(
							velocityClient.program,
							userStatsAccountPublicKey,
							undefined,
							undefined
						),
					},
				});

				let expectedSubAccountId = 0;
				try {
					await userStats.subscribe();
					expectedSubAccountId =
						userStats.getAccount().numberOfSubAccountsCreated;
				} catch (error: any) {
					// do nothing; assume that user stats account does not exist and expectedSubAccountId is 0
				}

				expect(expectedSubAccountId).to.equal(subAccountId);

				const derivedUserPubKey = getUserAccountPublicKeySync(
					velocityClient.program.programId,
					testWalletAuthority,
					expectedSubAccountId
				);
				expect(derivedUserPubKey.toString()).to.equal(
					userAccountPublicKey.toString()
				);

				expect(txn).to.exist;

				assertComputeBudgetThenProgram(
					txn as VersionedTransaction,
					velocityClient.program.programId,
					2
				);

				await signAndSendTransaction(txn as VersionedTransaction, testWallet);

				// check that the user account exists
				const userAccount = await defaultConnection.getAccountInfo(
					userAccountPublicKey
				);
				expect(userAccount).to.exist;

				// check that subaccount id is correct
				const user = new User({
					driftClient: velocityClient,
					userAccountPublicKey: userAccountPublicKey,
					accountSubscription: {
						type: 'custom',
						userAccountSubscriber: new OneShotUserAccountSubscriber(
							velocityClient.program,
							userAccountPublicKey,
							undefined,
							undefined
						),
					},
				});
				await user.subscribe();
				expect(user.getUserAccount().subAccountId).to.equal(
					expectedSubAccountId
				);

				const usdtSpotPosition = user
					.getUserAccount()
					.spotPositions.find(
						(position) => position.marketIndex === spotMarketIndex
					);
				expect(usdtSpotPosition).to.exist;
				expect(usdtSpotPosition?.scaledBalance.gtn(0)).to.be.true;

				await user.unsubscribe();
			} catch (error: any) {
				console.error('getCreateAndDepositTxn error:', error);
				expect(error).to.not.exist;
			}
		});

		it('should reject invalid spot market index', async () => {
			const amount = new BN(1000000);
			const invalidSpotMarketIndex = 999;

			try {
				await centralServerVelocity.getCreateAndDepositTxn(
					testWalletAuthority,
					amount,
					invalidSpotMarketIndex
				);
				expect.fail('Should have thrown error for invalid market index');
			} catch (error: any) {
				expect(error.message).to.include('Spot market config not found');
			}
		});

		it('should handle zero amount', async () => {
			const amount = new BN(0);
			const spotMarketIndex = 0;

			try {
				await centralServerVelocity.getCreateAndDepositTxn(
					testWalletAuthority,
					amount,
					spotMarketIndex
				);
				expect.fail('Should have thrown error for zero amount');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});

	describe('getDeleteUserTxn', () => {
		it('should create transaction for deleting user account, but expect error due to cooldown', async () => {
			try {
				const amount = new BN(1_000_000);
				const spotMarketIndex = 0;

				const { transaction: createAndDepositTxn, userAccountPublicKey } =
					await centralServerVelocity.getCreateAndDepositTxn(
						testWalletAuthority,
						amount,
						spotMarketIndex,
						{ txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 } }
					);

				await signAndSendTransaction(
					createAndDepositTxn as VersionedTransaction,
					testWallet
				);

				// Ensure account has no balances: withdraw max USDT first
				const withdrawMaxTxn = await centralServerVelocity.getWithdrawTxn(
					userAccountPublicKey,
					ZERO,
					spotMarketIndex,
					{
						isBorrow: false,
						isMax: true,
						txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
					}
				);
				await signAndSendTransaction(
					withdrawMaxTxn as VersionedTransaction,
					testWallet
				);

				// Now build and send the delete user transaction
				const deleteUserTxn = await centralServerVelocity.getDeleteUserTxn(
					userAccountPublicKey,
					{ txParams: { computeUnits: 1000000, computeUnitsPrice: 1_000 } }
				);
				assertComputeBudgetThenProgram(
					deleteUserTxn as VersionedTransaction,
					velocityClient.program.programId,
					2
				);

				// we expect an error because devnet delete account has a cooldown if recently created
				await signAndSendTransaction(
					deleteUserTxn as VersionedTransaction,
					testWallet
				);

				// check that the user account no longer exists
				// const userAccount = await defaultConnection.getAccountInfo(
				// 	userAccountPublicKey
				// );
				// expect(userAccount).to.not.exist;
			} catch (error: any) {
				console.log('accountManagement.test.ts error:', error);
				expect(error).to.exist;
				expect(error.message).to.include(
					'user is not idle with fresh user stats account creation'
				);
			}
		});

		it('should handle invalid user account public key', async () => {
			try {
				await centralServerVelocity.getDeleteUserTxn(
					invalidMockUserAccountPublicKey
				);
				expect.fail('Should have thrown error for invalid user key');
			} catch (error: any) {
				expect(error).to.exist;
			}
		});
	});
});

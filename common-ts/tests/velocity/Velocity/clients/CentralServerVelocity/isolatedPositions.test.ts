import { expect } from 'chai';
import * as sinon from 'sinon';
import { BN } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import { PositionDirection } from '@velocity-exchange/sdk';
import {
	centralServerVelocity,
	velocityClient,
	setupTestContext,
	teardownTestContext,
} from './context';
import { assertComputeBudgetThenProgram } from '../../../../utils/txAssertions';
import { getDevWallet } from '../../../../utils/wallet';

describe('CentralServerVelocity - Isolated Position Transactions', function () {
	this.timeout(10_000);
	const devWalletContext = getDevWallet();
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

	describe('getOpenPerpMarketOrderTxn with isolatedPositionDeposit', () => {
		it('should create open isolated position transaction with transfer before order', async () => {
			const txn = await centralServerVelocity.getOpenPerpMarketOrderTxn({
				userAccountPublicKey: devWalletUser0,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				amount: new BN(100_000),
				assetType: 'quote',
				positionMaxLeverage: 5,
				isolatedPositionDeposit: new BN(1_000_000),
				txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
				useSwift: false,
			});
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
			const vTx = txn as VersionedTransaction;
			expect(vTx.message.compiledInstructions.length).to.be.greaterThan(2);
		});
	});

	describe('getOpenPerpMarketOrderTxn with reduceOnly (close isolated position)', () => {
		it('should create reduce-only close isolated position transaction', async () => {
			const txn = await centralServerVelocity.getOpenPerpMarketOrderTxn({
				userAccountPublicKey: devWalletUser0,
				marketIndex: 0,
				direction: PositionDirection.SHORT,
				amount: new BN(100_000_000),
				assetType: 'base',
				positionMaxLeverage: 0,
				reduceOnly: true,
				txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
				useSwift: false,
			});
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
		});
	});

	describe('getWithdrawIsolatedPerpPositionCollateralTxn', () => {
		it('should create withdraw collateral transaction', async () => {
			const txn =
				await centralServerVelocity.getWithdrawIsolatedPerpPositionCollateralTxn(
					{
						userAccountPublicKey: devWalletUser0,
						marketIndex: 0,
						amount: new BN(500_000),
						txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
					}
				);
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
		});

		it('should include settle PnL ix when settlePnlFirst is true', async () => {
			const txn =
				await centralServerVelocity.getWithdrawIsolatedPerpPositionCollateralTxn(
					{
						userAccountPublicKey: devWalletUser0,
						marketIndex: 0,
						amount: new BN(500_000),
						settlePnlFirst: true,
						txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
					}
				);
			expect(txn).to.exist;
			const vTx = txn as VersionedTransaction;
			expect(vTx.message.compiledInstructions.length).to.be.greaterThan(2);
		});

		it('should reject invalid market index', async () => {
			try {
				await centralServerVelocity.getWithdrawIsolatedPerpPositionCollateralTxn(
					{
						userAccountPublicKey: devWalletUser0,
						marketIndex: 999,
						amount: new BN(500_000),
					}
				);
				expect.fail('Should have thrown');
			} catch (error: unknown) {
				expect((error as Error).message).to.include(
					'Perp market config not found'
				);
			}
		});
	});

	describe('getCloseAndWithdrawIsolatedPerpPositionTxn', () => {
		it('should create close-only transaction when withdrawCollateralAfterClose is false', async () => {
			const txn =
				await centralServerVelocity.getCloseAndWithdrawIsolatedPerpPositionTxn({
					userAccountPublicKey: devWalletUser0,
					marketIndex: 0,
					baseAssetAmount: new BN(100_000_000),
					direction: PositionDirection.SHORT,
					withdrawCollateralAfterClose: false,
					txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
				});
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
		});

		it('should create close+withdraw transaction when withdrawCollateralAfterClose is true', async () => {
			const txn =
				await centralServerVelocity.getCloseAndWithdrawIsolatedPerpPositionTxn({
					userAccountPublicKey: devWalletUser0,
					marketIndex: 0,
					baseAssetAmount: new BN(100_000_000),
					direction: PositionDirection.SHORT,
					withdrawCollateralAfterClose: true,
					txParams: { computeUnits: 1_000_000, computeUnitsPrice: 1_000 },
				});
			expect(txn).to.exist;
			const vTx = txn as VersionedTransaction;
			expect(vTx.message.compiledInstructions.length).to.be.greaterThan(2);
		});

		it('should reject invalid market index', async () => {
			try {
				await centralServerVelocity.getCloseAndWithdrawIsolatedPerpPositionTxn({
					userAccountPublicKey: devWalletUser0,
					marketIndex: 999,
					baseAssetAmount: new BN(100_000),
					direction: PositionDirection.SHORT,
				});
				expect.fail('Should have thrown');
			} catch (error: unknown) {
				expect((error as Error).message).to.include(
					'Perp market config not found'
				);
			}
		});
	});

	describe('getDepositAndOpenIsolatedPerpPositionTxn', () => {
		it('should create deposit + open isolated position transaction', async () => {
			const txn =
				await centralServerVelocity.getDepositAndOpenIsolatedPerpPositionTxn({
					userAccountPublicKey: devWalletUser0,
					marketIndex: 0,
					direction: PositionDirection.LONG,
					amount: new BN(100_000),
					assetType: 'quote',
					positionMaxLeverage: 5,
					depositAmount: new BN(1_000_000),
					txParams: {
						computeUnits: 1_000_000,
						computeUnitsPrice: 1_000,
					},
					useSwift: false,
				});
			expect(txn).to.exist;
			assertComputeBudgetThenProgram(
				txn as VersionedTransaction,
				velocityClient.program.programId,
				2
			);
			const vTx = txn as VersionedTransaction;
			expect(vTx.message.compiledInstructions.length).to.be.greaterThan(2);
		});

		it('should reject zero depositAmount', async () => {
			try {
				await centralServerVelocity.getDepositAndOpenIsolatedPerpPositionTxn({
					userAccountPublicKey: devWalletUser0,
					marketIndex: 0,
					direction: PositionDirection.LONG,
					amount: new BN(100_000),
					assetType: 'quote',
					positionMaxLeverage: 5,
					depositAmount: new BN(0),
					useSwift: false,
				});
				expect.fail('Should have thrown');
			} catch (error: unknown) {
				expect((error as Error).message).to.include(
					'depositAmount is required'
				);
			}
		});
	});

	describe('getCloseAndWithdrawIsolatedPerpPositionToWalletTxn', () => {
		it('should create close + withdraw to wallet transaction', async () => {
			const txn =
				await centralServerVelocity.getCloseAndWithdrawIsolatedPerpPositionToWalletTxn(
					{
						userAccountPublicKey: devWalletUser0,
						marketIndex: 0,
						baseAssetAmount: new BN(100_000_000),
						direction: PositionDirection.SHORT,
						txParams: {
							computeUnits: 1_000_000,
							computeUnitsPrice: 1_000,
						},
					}
				);
			expect(txn).to.exist;
			const vTx = txn as VersionedTransaction;
			expect(vTx.message.compiledInstructions.length).to.be.greaterThan(2);
		});
	});
});

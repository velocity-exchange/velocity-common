import {
	BigNum,
	BN,
	VelocityClient,
	getTokenAmount,
	SpotBalanceType,
	SpotMarketAccount,
	SpotMarketConfig,
} from '@velocity-exchange/sdk';
import { UIMarket } from '../types/UIMarket';
import { logger } from './logger';

/**
 * Calculates the next APR for insurance fund staking
 *
 * @param spotMarket - Spot market account
 * @param vaultBalanceBigNum - Current vault balance as BigNum
 * @returns Next APR as a percentage (e.g., 35 means 35% APR)
 */
function calculateVaultNextApr(
	spotMarket: SpotMarketAccount,
	vaultBalanceBigNum: BigNum
): number {
	const MAX_APR = 1000;

	const { precisionExp } = UIMarket.spotMarkets[spotMarket.marketIndex];

	try {
		const vaultBalance = vaultBalanceBigNum.toNum();

		// Calculate revenue pool
		const revenuePoolBN = getTokenAmount(
			spotMarket.revenuePool.scaledBalance,
			spotMarket,
			SpotBalanceType.DEPOSIT
		);
		const revenuePoolBigNum = BigNum.from(revenuePoolBN, precisionExp);
		const revenuePool = revenuePoolBigNum.toNum();

		// APR calculation constants and factors
		const payoutRatio = 0.1;
		// the insurance fund is 100% staker-owned: every settled token accrues to
		// stakers as share-price appreciation (no protocol split)
		const ratioForStakers = spotMarket.insuranceFund.revenueSettlePeriod.gtn(0)
			? 1
			: 0;

		// Settle periods from on-chain data
		const revSettlePeriod =
			spotMarket.insuranceFund.revenueSettlePeriod.toNumber() * 1000;

		// Handle edge case where settle period is 0
		if (revSettlePeriod === 0) {
			return 0;
		}

		// Calculate settlements per year (31536000000 ms = 1 year)
		const settlesPerYear = 31536000000 / revSettlePeriod;

		// Calculate projected annual revenue
		const projectedAnnualRev = revenuePool * settlesPerYear * payoutRatio;

		// Calculate uncapped APR
		const uncappedApr =
			vaultBalance === 0 ? 0 : (projectedAnnualRev / vaultBalance) * 100;

		const cappedApr = Math.min(uncappedApr, MAX_APR);

		// Calculate final APR for stakers
		const nextApr = cappedApr * ratioForStakers;

		return nextApr;
	} catch (error) {
		logger.warn('Error calculating next APR:', error);
		return 0;
	}
}

/**
 * Get the size of an insurance fund vault
 * @param spotMarketConfig
 * @param velocityClient
 * @returns
 */
export const getIfVaultBalance = async (
	spotMarketConfig: SpotMarketConfig,
	velocityClient: VelocityClient
) => {
	const spotMarket = velocityClient.getSpotMarketAccountOrThrow(
		spotMarketConfig.marketIndex
	);

	const vaultBalanceBN = new BN(
		(
			await velocityClient.provider.connection.getTokenAccountBalance(
				spotMarket.insuranceFund.vault
			)
		).value.amount
	);

	const vaultBalanceBigNum = BigNum.from(
		vaultBalanceBN,
		spotMarketConfig.precisionExp
	);

	return vaultBalanceBigNum;
};

/**
 * Get the current staking APR for a market.
 * @param spotMarketConfig
 * @param velocityClient
 * @returns APR Percentage .. e.g. 100 for 100%
 */
export const getIfStakingVaultApr = async (
	spotMarketConfig: SpotMarketConfig,
	velocityClient: VelocityClient
) => {
	const vaultBalance = await getIfVaultBalance(
		spotMarketConfig,
		velocityClient
	);

	return calculateVaultNextApr(
		velocityClient.getSpotMarketAccountOrThrow(spotMarketConfig.marketIndex),
		vaultBalance
	);
};

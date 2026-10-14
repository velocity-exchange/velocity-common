import {
	BN,
	PositionDirection,
	User,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getPositionMaxLeverageIxIfNeeded } from './positionMaxLeverage';
import {
	getIsolatedPositionDepositIxIfNeeded,
	resolveIsolatedPositionDepositsWithOverride,
} from './isolatedPositionDeposit';
import { IsolatedPositionDepositsOverride } from './types';

/**
 * The leverage and isolated-margin instructions an order needs first. `replenish` tops up
 * other under-collateralized isolated positions as well.
 */
export async function createPositionSetupIxs(
	params: {
		velocityClient: VelocityClient;
		user: User;
		marketIndex: number;
		direction: PositionDirection;
		amount: BN;
		positionMaxLeverage: number;
		marginMode?: 'isolated' | 'cross';
		isolatedPositionDepositsOverride?: IsolatedPositionDepositsOverride;
		mainSignerOverride?: PublicKey;
	},
	replenish: boolean
): Promise<TransactionInstruction[]> {
	const { velocityClient, user, marketIndex, mainSignerOverride } = params;
	const deposits = resolveIsolatedPositionDepositsWithOverride(
		params.isolatedPositionDepositsOverride,
		{
			velocityClient,
			user,
			marketIndex,
			baseAssetAmount: params.amount,
			direction: params.direction,
			positionMaxLeverage: params.positionMaxLeverage,
			marginMode: params.marginMode,
			replenishUnderwaterPositions: replenish,
		}
	);

	const ixs = await Promise.all([
		getPositionMaxLeverageIxIfNeeded(
			velocityClient,
			user,
			marketIndex,
			params.positionMaxLeverage,
			mainSignerOverride
		),
		...(deposits?.additionalIsolatedPositionDeposits ?? []).map((deposit) =>
			getIsolatedPositionDepositIxIfNeeded(
				velocityClient,
				user,
				deposit.marketIndex,
				deposit.amount,
				mainSignerOverride
			)
		),
		getIsolatedPositionDepositIxIfNeeded(
			velocityClient,
			user,
			marketIndex,
			deposits?.mainDeposit,
			mainSignerOverride
		),
	]);

	return ixs.filter((ix): ix is TransactionInstruction => ix !== undefined);
}

import { VelocityClient, User } from '@velocity-exchange/sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { convertLeverageToMarginRatio } from '../../../../../utils/trading/leverage';

/**
 * Helper function to determine if leverage needs updating and create the instruction if needed.
 * Returns the instruction to update position max leverage, or undefined if no update is needed.
 */
export async function getPositionMaxLeverageIxIfNeeded(
	velocityClient: VelocityClient,
	user: User,
	marketIndex: number,
	positionMaxLeverage?: number,
	signingAuthority?: PublicKey
): Promise<TransactionInstruction | undefined> {
	if (!positionMaxLeverage) {
		return undefined;
	}

	// Get current position if it exists
	const userAccount = user.getUserAccountOrThrow();
	const currentPosition = userAccount.perpPositions.find(
		(pos) => pos.marketIndex === marketIndex
	);

	// Convert leverage to margin ratio
	const targetMarginRatio = convertLeverageToMarginRatio(positionMaxLeverage);

	// Check if leverage needs updating
	const currentMarginRatio = currentPosition?.maxMarginRatio || 0;

	// Only create instruction if:
	// 1. We have a target leverage to set, AND
	// 2. Either there's no position yet (currentMarginRatio === 0) OR the margin ratios differ
	if (targetMarginRatio && targetMarginRatio !== currentMarginRatio) {
		return await velocityClient.getUpdateUserPerpPositionCustomMarginRatioIx(
			marketIndex,
			targetMarginRatio,
			userAccount.subAccountId,
			{
				userAccountPublicKey: user.getUserAccountPublicKey(),
				authority: userAccount.authority,
				signingAuthority,
			}
		);
	}

	return undefined;
}

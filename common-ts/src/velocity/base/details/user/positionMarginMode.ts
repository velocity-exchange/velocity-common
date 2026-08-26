import { User } from '@velocity-exchange/sdk';

/**
 * The position's margin mode based on the position's `positionFlag`. Returns 'cross' if no position is found.
 *
 * @param user - The user to get the position margin mode for
 * @param marketIndex - The market index to get the position margin mode for
 */
export const getPositionMarginMode = (
	user: User,
	marketIndex: number
): 'isolated' | 'cross' => {
	const perpPosition = user.getPerpPosition(marketIndex);
	if (!perpPosition) return 'cross';
	const isIsolated = user.isPerpPositionIsolated(perpPosition);
	return isIsolated ? 'isolated' : 'cross';
};

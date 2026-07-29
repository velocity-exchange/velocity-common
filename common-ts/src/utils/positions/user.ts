import {
	VelocityClient,
	PublicKey,
	User,
	ZERO,
	getUserAccountPublicKeySync,
} from '@velocity-exchange/sdk';

const checkIfUserAccountExists = async (
	velocityClient: VelocityClient,
	config:
		| {
				type: 'userPubKey';
				userPubKey: PublicKey;
		  }
		| {
				type: 'subAccountId';
				subAccountId: number;
				authority: PublicKey;
		  }
) => {
	let userPubKey: PublicKey;

	if (config.type === 'userPubKey') {
		userPubKey = config.userPubKey;
	} else {
		userPubKey = getUserAccountPublicKeySync(
			velocityClient.program.programId,
			config.authority,
			config.subAccountId
		);
	}

	const accountInfo =
		await velocityClient.connection.getAccountInfo(userPubKey);

	return accountInfo !== null;
};

/**
 * A user's max leverage for a market is stored on-chain in the `PerpPosition` struct of the `UserAccount`.
 * There are a few scenarios for how a market's max leverage is defined:
 *
 * 1. When the user does not have a position ("empty" or not) in the market in their `UserAccount` data,
 * and creates an order for the market, an "empty" `PerpPosition` will be upsert to the `UserAccount` data,
 * and will contain the max margin ratio set by the user. Note that the `UserAccount` data can store up
 * to 8 `PerpPosition` structs, and most of the time the majority of the `PerpPosition` structs will be
 * "empty" if the user does not have the max 8 perp positions open. The max leverage is then derived from
 * the max margin ratio set in the `PerpPosition` struct.
 *
 * 2. If the user has a position ("empty" or not), but no open orders and is provided with a saved max leverage,
 * the saved max leverage is used.
 *
 * 3. When the user does not have a position ("empty" or not), it is expected of the UI to store and persist
 * the max leverage in the UI client.
 *
 * 4. In cases where the user has a position before the market max leverage feature was shipped, the
 * position is not expected to have a max margin ratio set, and the UI should display the regular max
 * leverage for the market.
 */
const getUserMaxLeverageForMarket = (
	user: User | undefined,
	marketIndex: number,
	marketMaxLeverage: number,
	uiSavedMaxLeverage?: number
) => {
	// if no saved max leverage is provided, return the regular max leverage for the market
	const DEFAULT_MAX_LEVERAGE = uiSavedMaxLeverage ?? marketMaxLeverage;

	if (!user) {
		return DEFAULT_MAX_LEVERAGE;
	}

	const openOrClosedPosition = user.getPerpPosition(marketIndex); // this position does not have to be open, it can be a closed position (a.k.a "empty") but has max margin ratio set.

	if (!openOrClosedPosition) {
		return DEFAULT_MAX_LEVERAGE;
	}

	const positionHasMaxMarginRatioSet = !!openOrClosedPosition.maxMarginRatio;
	const isPositionOpen = !openOrClosedPosition.baseAssetAmount.eq(ZERO);
	const hasNoOpenOrders = openOrClosedPosition.openOrders === 0;

	if (positionHasMaxMarginRatioSet) {
		// Special case: open position with no orders - use UI saved value if available
		if (isPositionOpen && hasNoOpenOrders && uiSavedMaxLeverage) {
			return uiSavedMaxLeverage;
		}

		return parseFloat(
			((1 / openOrClosedPosition.maxMarginRatio) * 10000).toFixed(2)
		);
	}

	if (isPositionOpen) {
		// user has an existing position from before PML ship (this means no max margin ratio set onchain yet)
		return marketMaxLeverage;
	}

	// user has closed position with no margin ratio set, return default value
	return DEFAULT_MAX_LEVERAGE;
};

export { checkIfUserAccountExists, getUserMaxLeverageForMarket };

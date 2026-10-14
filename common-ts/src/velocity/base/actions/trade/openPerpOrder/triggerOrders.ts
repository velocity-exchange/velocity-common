import {
	BN,
	MarketType,
	OptionalOrderParams,
	PositionDirection,
	User,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { ENUM_UTILS } from '../../../../../utils';
import { buildNonMarketOrderParams } from '../../../../utils/orderParams';
import { OptionalTriggerOrderParams } from './types';

export type BracketOrders = {
	takeProfit?: OptionalTriggerOrderParams;
	stopLoss?: OptionalTriggerOrderParams;
};

/** The take-profit and stop-loss of an entry, on the side that closes it. */
export function bracketTriggerOrderParams({
	marketIndex,
	entryDirection,
	entryBaseAssetAmount,
	bracketOrders,
}: {
	marketIndex: number;
	entryDirection: PositionDirection;
	entryBaseAssetAmount: BN;
	bracketOrders?: BracketOrders;
}): OptionalOrderParams[] {
	const direction = ENUM_UTILS.match(entryDirection, PositionDirection.LONG)
		? PositionDirection.SHORT
		: PositionDirection.LONG;

	return (['takeProfit', 'stopLoss'] as const).flatMap((orderType) => {
		const bracket = bracketOrders?.[orderType];
		if (!bracket) return [];

		return [
			buildNonMarketOrderParams({
				marketIndex,
				marketType: MarketType.PERP,
				direction,
				baseAssetAmount: bracket.baseAssetAmount ?? entryBaseAssetAmount,
				orderConfig: {
					orderType,
					triggerPrice: bracket.triggerPrice,
					limitPrice: bracket.limitPrice,
				},
				reduceOnly: bracket.reduceOnly ?? true,
			}),
		];
	});
}

/**
 * Arm triggers in the user's order slots. Relay fires only the triggers a sync has armed, so
 * the sync rides in the same transaction.
 */
export async function createTriggerOrderIxs({
	velocityClient,
	user,
	orderParams,
	mainSignerOverride,
}: {
	velocityClient: VelocityClient;
	user: User;
	orderParams: OptionalOrderParams[];
	mainSignerOverride?: PublicKey;
}): Promise<TransactionInstruction[]> {
	if (orderParams.length === 0) return [];

	const { subAccountId } = user.getUserAccountOrThrow();
	const marketIndexes = [
		...new Set(orderParams.map((params) => params.marketIndex)),
	];

	return Promise.all([
		velocityClient.getPlaceTriggerOrdersIx(
			orderParams,
			subAccountId,
			undefined,
			{
				authority: mainSignerOverride,
			}
		),
		velocityClient.getSyncTriggerConditionsIx(marketIndexes, subAccountId, {
			payer: mainSignerOverride,
		}),
	]);
}

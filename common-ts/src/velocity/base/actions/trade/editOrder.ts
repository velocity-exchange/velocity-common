import {
	BN,
	ModifyOrderV1Params,
	VelocityClient,
	OrderTriggerCondition,
	PositionDirection,
	SlotDurationMs,
	User,
} from '@velocity-exchange/sdk';
import {
	PublicKey,
	Transaction,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';
import invariant from 'tiny-invariant';
import { WithTxnParams } from '../../types';

/**
 * Parameters for editing an existing order
 */
interface EditOrderParams {
	/** New direction for the order (long/short) */
	newDirection?: PositionDirection;
	/** New base amount for the order */
	newBaseAmount?: BN;
	/** New limit price for the order */
	newLimitPrice?: BN;
	/** New oracle price offset for oracle limit orders, PRICE_PRECISION (1e6), signed */
	newOraclePriceOffset?: BN;
	/** New trigger price for conditional orders */
	newTriggerPrice?: BN;
	/** New trigger condition for conditional orders */
	newTriggerCondition?: OrderTriggerCondition;
	/** Whether the order should only reduce position size */
	reduceOnly?: boolean;
	/** Whether the order should only be posted (maker only) */
	postOnly?: boolean;
	/** Bit flags for additional order configuration */
	bitFlags?: number;
	/** Maximum timestamp for order validity */
	maxTs?: BN;
	/** Order policy configuration */
	policy?: number;
	/** The leverage to be used for this position. */
	positionMaxLeverage?: number;
}

export interface CreateEditOrderIxParams {
	velocityClient: VelocityClient;
	user: User;
	orderId: number;
	editOrderParams: EditOrderParams;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	mainSignerOverride?: PublicKey;
}

/**
 * Edits a slot order, which is an armed trigger. A book order has no slot, so it goes through
 * `createModifyClobOrderIx`. The modify replaces the order under a new order id, so the second
 * instruction re-syncs the trigger's relay watch. Without it the edited trigger never fires.
 * @param velocityClient - The VelocityClient instance
 * @param userPublicKey - The public key of the user who owns the order
 * @param orderId - The ID of the order to edit
 * @param editOrderParams - Parameters containing the new order values
 * @returns Promise that resolves to the modify and trigger sync instructions
 */
export const createEditOrderIxs = async (
	params: CreateEditOrderIxParams
): Promise<TransactionInstruction[]> => {
	const { velocityClient, user, orderId, editOrderParams, mainSignerOverride } =
		params;
	invariant(user.getOrder(orderId), 'Current order not found');

	return velocityClient.getModifyOrderIxs(
		{
			orderId,
			...editOrderParams,
		},
		undefined,
		{
			user,
			authority: mainSignerOverride,
		}
	);
};

type CreateEditOrderTxnParams = WithTxnParams<CreateEditOrderIxParams>;

/**
 * Creates a complete transaction to edit an existing order
 * @param velocityClient - The VelocityClient instance
 * @param userPublicKey - The public key of the user who owns the order
 * @param orderId - The ID of the order to edit
 * @param editOrderParams - Parameters containing the new order values
 * @param txParams - Optional transaction parameters (compute units, priority fees, etc.)
 * @returns Promise that resolves to a Transaction or VersionedTransaction
 */
export const createEditOrderTxn = async ({
	txParams,
	...params
}: CreateEditOrderTxnParams): Promise<Transaction | VersionedTransaction> => {
	return params.velocityClient.buildTransaction(
		await createEditOrderIxs(params),
		txParams
	);
};

interface CreateModifyClobOrderIxParams {
	velocityClient: VelocityClient;
	user: User;
	modify: ModifyOrderV1Params;
	/** The feed's `takerOrigin` flag. A modified taker remainder rests as a maker order. */
	takerOrigin: boolean;
	mainSignerOverride?: PublicKey;
}

/**
 * Reprices or resizes a resting book order. The order keeps its id and loses its queue position.
 * A `rejectIfCrossed` modify that the book refuses leaves no order at all.
 */
export const createModifyClobOrderIx = async (
	params: CreateModifyClobOrderIxParams
): Promise<TransactionInstruction> => {
	const { velocityClient, user, modify, takerOrigin, mainSignerOverride } =
		params;

	return velocityClient.getModifyOrderV1Ix(
		modify,
		user.getUserAccountOrThrow().subAccountId,
		takerOrigin,
		{ authority: mainSignerOverride }
	);
};

import {
	getSignedMsgUserAccountPublicKey,
	SignedMsgOrderParamsDelegateMessage,
	SignedMsgOrderParamsMessage,
	signedMsgNetworkForEnv,
	signedMsgSigningBytes,
} from '@velocity-exchange/sdk';
import {
	BN,
	VelocityClient,
	generateSignedMsgUuid,
	getOrderParams,
	msToSlotsCeilNum,
	OptionalOrderParams,
	OrderType,
	PublicKey,
	SlotDurationMs,
	slotsToMsNum,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../../../../../../utils';
import {
	getSwiftConfirmationDeadlineMs,
	getSwiftConfirmationTimeoutMs,
	getSwiftPlacementDeadlineMs,
} from '../../../../../../utils/signedMsgs';
import {
	SwiftClient,
	SwiftOrderConfirmedEvent,
	SwiftOrderErroredEvent,
	SwiftOrderEvent,
	SwiftOrderEventWithParams,
	SwiftOrderSentEvent,
} from '../../../../../../clients/swiftClient';
import { MarketId } from '../../../../../../types';
import { Observable, Subscription } from 'rxjs';
import { OptionalTriggerOrderParams } from '../types';
import { convertLeverageToMarginRatio } from '../../../../../../utils/trading/leverage';
import { Connection } from '@solana/web3.js';

/**
 * Time allowed for the user to approve the signing prompt in a wallet UI. Converted to
 * slots at the live slot duration.
 */
export const USER_SIGNING_MESSAGE_BUFFER_MS = 2_800;

/**
 * The equivalent budget for a signer that needs no human approval, such as a
 * delegated embedded wallet. It covers the signature, the hop to the SWIFT
 * server and the filler picking the order up, with no prompt to wait on.
 */
export const DELEGATE_SIGNING_MESSAGE_BUFFER_MS = 800;

/**
 * The least signing budget a resting limit is stamped ahead by. A resting limit's message
 * slot is its placement deadline, so the budget is the order's whole life on the way in.
 */
export const MINIMUM_SWIFT_SIGNING_BUDGET_MS = 14_000;

/** How long past its message slot the program places an order that is not a resting limit. */
export const SIGNED_MSG_FILL_WINDOW_MS = 30_000;

/**
 * Ceiling on either signing budget.
 *
 * The buffer becomes the stamped message slot, and for a resting limit that slot
 * is a placement deadline the program refuses beyond a 30s lead
 * (`max_resting_limit_lead` in `place_signed_msg_taker_order`). A budget past
 * that bound rejects every resting limit on chain, silently, so the tuning knob
 * is clamped below it rather than trusted. Still leaves room above the 14s floor.
 */
export const MAXIMUM_SIGNING_MESSAGE_BUFFER_MS = 20_000;

/**
 * The signing budget for this signer, in slots.
 *
 * `autoSigned` must mean the signature needs no human approval (a delegated
 * embedded wallet), not merely that the order is signed by a delegate: a
 * delegate can still be a wallet that prompts.
 *
 * Never returns 0. Callers pass this down through `openPerp*Order`, which use 0
 * as the "not supplied" sentinel that makes `prepSwiftOrder` fall back to its
 * own default, so a 0 here would silently restore the full human budget.
 */
export const getUserSigningSlotBuffer = ({
	autoSigned,
	slotDuration,
	budgetMsOverrides,
}: {
	autoSigned: boolean;
	slotDuration: SlotDurationMs;
	/** Per-signer tuning, so a deployment can move either budget without a release. */
	budgetMsOverrides?: { autoSigned?: number; prompted?: number };
}): number => {
	const budgetMs = autoSigned
		? (budgetMsOverrides?.autoSigned ?? DELEGATE_SIGNING_MESSAGE_BUFFER_MS)
		: (budgetMsOverrides?.prompted ?? USER_SIGNING_MESSAGE_BUFFER_MS);

	return Math.min(
		Math.max(1, msToSlotsCeilNum(budgetMs, slotDuration)),
		msToSlotsCeilNum(MAXIMUM_SIGNING_MESSAGE_BUFFER_MS, slotDuration)
	);
};

/** Slots before the placement deadline at which signing stops. */
export const SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS = 5;
export const MINIMUM_SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS = 5;

/**
 * Wall-clock cadence at which the slot feed is polled while the wallet prompt is
 * open. A poll interval, not a slot length.
 */
const SIGNING_DEADLINE_POLL_INTERVAL_MS = 250;

export interface SwiftOrderOptions {
	wallet: {
		signMessage: (message: Uint8Array) => Promise<Uint8Array>;
		takerAuthority: PublicKey;
		signingAuthority?: PublicKey;
	};
	swiftServerUrl: string;
	/**
	 * Buffer slots to account for the user to sign the message. A resting limit's message slot
	 * is stamped this far ahead, and that slot is its placement deadline.
	 */
	userSigningSlotBuffer?: number;
	isDelegate?: boolean;
	/**
	 * Live chain slot, polled while the wallet prompt is open so the signing guard
	 * fires on the real deadline. Return 0 (or omit) for a dead feed, which falls
	 * back to the wall-clock timer.
	 */
	slotSource?: () => number;
	/**
	 * Multiplier for the SWIFT confirmation timeout (after sending SWIFT order). Default is 1.
	 */
	confirmationMultiplier?: number;
	callbacks?: {
		onOrderParamsMessagePrepped?: (
			orderParamsMessage:
				| SignedMsgOrderParamsMessage
				| SignedMsgOrderParamsDelegateMessage,
			timing: SwiftOrderTiming
		) => void;
		onSigningExpiry?: (
			orderParamsMessage:
				| SignedMsgOrderParamsMessage
				| SignedMsgOrderParamsDelegateMessage
		) => void;
		onSigningSuccess?: (
			signedMessage: Uint8Array,
			// we add the following here, because the onSigningSuccess callback is called before the order is sent to the swift server
			orderUuid: Uint8Array,
			orderParamsMessage:
				| SignedMsgOrderParamsMessage
				| SignedMsgOrderParamsDelegateMessage
		) => void;
		onSent?: (
			swiftSentEvent: SwiftOrderEventWithParams<SwiftOrderSentEvent>
		) => void;
		onConfirmed?: (
			swiftConfirmedEvent: SwiftOrderEventWithParams<SwiftOrderConfirmedEvent>
		) => void;
		onExpired?: (
			swiftExpiredEvent: SwiftOrderEventWithParams<SwiftOrderErroredEvent>
		) => void;
		onErrored?: (
			swiftErroredEvent: SwiftOrderEventWithParams<SwiftOrderErroredEvent>
		) => void;
	};
	/**
	 * Used for internal tracking of the source of the swift order.
	 */
	source?: string;
}

/**
 * Represents a prepared SWIFT order message that is ready to be signed and sent.
 * This is the output of the "prep" step, before signing occurs.
 *
 * Consumers should:
 * 1. Sign `signingBytes` with the user's wallet
 * 2. Send the signed message along with the other fields to the SWIFT server
 */
export interface SwiftOrderMessage {
	/** The encoded order message, as bytes and as the string the SWIFT server is sent */
	hexEncodedSwiftOrderMessage: {
		uInt8Array: Uint8Array;
		string: string;
	};
	/** What the taker signs: the program's domain prefix, then the hex message */
	signingBytes: Uint8Array;
	/** The order parameters message that was encoded */
	signedMsgOrderParamsMessage:
		| SignedMsgOrderParamsMessage
		| SignedMsgOrderParamsDelegateMessage;
	/** The slot number used for the signed message */
	slotForSignedMsg: BN;
	/** Unique identifier for the signed message order */
	signedMsgOrderUuid: Uint8Array;
	/** The market index this order is for */
	marketIndex: number;
	/** Slots until the program stops placing the order (used for confirmation timeout) */
	slotsTillPlacementDeadline: number;
	/** Wall time in ms after which the program no longer places the order */
	placementDeadlineMs: number;
	/** Absolute slot after which the order must no longer be signed */
	signingDeadlineSlot: number;
	/** Time in milliseconds before the signing window expires */
	expirationTimeMs: number;
}

export type SwiftOrderObservable = Observable<SwiftOrderEvent>;

interface PrepSwiftOrderParams {
	/** The Velocity client instance */
	velocityClient: VelocityClient;
	/** The taker user account information */
	takerUserAccount: {
		/** Public key of the user account */
		pubKey: PublicKey;
		/** User account ID */
		subAccountId: number;
	};
	/** Current blockchain slot number */
	currentSlot: number;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	/** Whether this is a delegate order */
	isDelegate: boolean;
	/** Order parameters including main order and optional stop loss/take profit */
	orderParams: {
		/** Main order parameters */
		main: OptionalOrderParams;
		/** Optional stop loss order parameters */
		stopLoss?: OptionalTriggerOrderParams;
		/** Optional take profit order parameters */
		takeProfit?: OptionalTriggerOrderParams;
		/** Optional max leverage for the position */
		positionMaxLeverage?: number;
		/** Optional isolated position deposit amount */
		isolatedPositionDeposit?: BN;
	};
	/**
	 * Buffer slots to account for the user to sign the message. A resting limit's message slot
	 * is stamped this far ahead, and that slot is its placement deadline.
	 */
	userSigningSlotBuffer?: number;
	/**
	 * Optional builder code parameters for revenue sharing.
	 * If provided, the builder will receive a portion of the trading fees.
	 *
	 * Prerequisites:
	 * - User must have initialized a RevenueShareEscrow account
	 * - Builder must be in the user's approved_builders list
	 * - builderFeeTenthBps must not exceed the builder's max_fee_tenth_bps
	 */
	builderParams?: {
		/**
		 * Index of the builder in the user's approved_builders list.
		 * This is the position (0-indexed) of the builder in the RevenueShareEscrow.approved_builders array.
		 */
		builderIdx: number;
		/**
		 * Fee to charge for this order, in tenths of basis points.
		 * Must be <= the builder's max_fee_tenth_bps.
		 *
		 * Examples:
		 * - 10 = 1 bps = 0.01%
		 * - 50 = 5 bps = 0.05%
		 * - 100 = 10 bps = 0.1%
		 */
		builderFeeTenthBps: number;
	};
	/**
	 * `QuoterV0` entry keys of the `Custom` quoters (PropAMMs) the taker signs for. The placer
	 * carries them, and they can fill the order once it has served the market's speed bump.
	 */
	route?: PublicKey[];
}

/**
 * Prepares a swift order by encoding the order parameters into a message format
 * suitable for signing and sending to the Swift server.
 *
 * @param velocityClient - The Velocity client instance
 * @param takerUserAccount - The taker user account information
 * @param currentSlot - Current blockchain slot number
 * @param isDelegate - Whether this is a delegate order
 * @param orderParams - Order parameters including main order and optional stop loss/take profit
 * @param userSigningSlotBuffer - Buffer slots to account for the user to sign the message. A resting limit is stamped this far ahead.
 *
 * @returns An object containing:
 *   - `hexEncodedSwiftOrderMessage`: The encoded order message in both Uint8Array and string formats. The Uint8Array format is for a wallet to sign, while the string format is used to send to the SWIFT server.
 *   - `signedMsgOrderParamsMessage`: The signed message order parameters
 *   - `slotForSignedMsg`: The slot number for the signed message
 *   - `signedMsgOrderUuid`: Unique identifier for the signed message order
 */
export const prepSwiftOrder = ({
	velocityClient,
	takerUserAccount,
	currentSlot,
	slotDuration,
	isDelegate,
	orderParams,
	userSigningSlotBuffer,
	builderParams,
	route,
}: PrepSwiftOrderParams): {
	hexEncodedSwiftOrderMessage: {
		uInt8Array: Uint8Array;
		string: string;
	};
	signingBytes: Uint8Array;
	signedMsgOrderParamsMessage:
		| SignedMsgOrderParamsMessage
		| SignedMsgOrderParamsDelegateMessage;
	slotForSignedMsg: BN;
	signedMsgOrderUuid: Uint8Array;
	resolvedUserSigningSlotBuffer: number;
} => {
	const mainOrderParams = getOrderParams(orderParams.main);

	userSigningSlotBuffer = Math.max(
		userSigningSlotBuffer ?? 0,
		msToSlotsCeilNum(MINIMUM_SWIFT_SIGNING_BUDGET_MS, slotDuration)
	);

	// A market order's slot may not lead the chain, so only a resting limit is stamped ahead.
	const messageSlot = new BN(
		isRestingLimit(mainOrderParams)
			? currentSlot + userSigningSlotBuffer
			: currentSlot
	);

	const signedMsgOrderUuid = generateSignedMsgUuid();

	const baseSignedMsgOrderParamsMessage = {
		signedMsgOrderParams: mainOrderParams,
		uuid: signedMsgOrderUuid,
		slot: messageSlot,
		stopLossOrderParams: orderParams.stopLoss
			? {
					baseAssetAmount: orderParams.stopLoss.baseAssetAmount,
					triggerPrice: orderParams.stopLoss.triggerPrice,
				}
			: null,
		takeProfitOrderParams: orderParams.takeProfit
			? {
					baseAssetAmount: orderParams.takeProfit.baseAssetAmount,
					triggerPrice: orderParams.takeProfit.triggerPrice,
				}
			: null,
		maxMarginRatio: orderParams.positionMaxLeverage
			? convertLeverageToMarginRatio(orderParams.positionMaxLeverage)
			: null,
		isolatedPositionDeposit: orderParams.isolatedPositionDeposit ?? null,
		// Include builder params if provided
		builderIdx: builderParams?.builderIdx ?? null,
		builderFeeTenthBps: builderParams?.builderFeeTenthBps ?? null,
		network: signedMsgNetworkForEnv(velocityClient.env),
		route: route?.length ? route : null,
	};

	const signedMsgOrderParamsMessage:
		| SignedMsgOrderParamsMessage
		| SignedMsgOrderParamsDelegateMessage = isDelegate
		? {
				...baseSignedMsgOrderParamsMessage,
				takerPubkey: takerUserAccount.pubKey,
			}
		: {
				...baseSignedMsgOrderParamsMessage,
				subAccountId: takerUserAccount.subAccountId,
			};

	const encodedOrderMessage = velocityClient.encodeSignedMsgOrderParamsMessage(
		signedMsgOrderParamsMessage,
		isDelegate
	);
	const hexEncodedSwiftOrderMessage = Buffer.from(
		encodedOrderMessage.toString('hex')
	);

	return {
		hexEncodedSwiftOrderMessage: {
			uInt8Array: new Uint8Array(hexEncodedSwiftOrderMessage),
			string: hexEncodedSwiftOrderMessage.toString(),
		},
		signingBytes: new Uint8Array(
			signedMsgSigningBytes(
				velocityClient.program.programId,
				hexEncodedSwiftOrderMessage
			)
		),
		signedMsgOrderParamsMessage,
		slotForSignedMsg: messageSlot,
		signedMsgOrderUuid,
		resolvedUserSigningSlotBuffer: userSigningSlotBuffer,
	};
};

/**
 * Error thrown when the signing deadline passes before the user signs
 */
export class AuctionSlotExpiredError extends Error {
	name = 'AuctionSlotExpiredError';

	/**
	 * Creates an instance of AuctionSlotExpiredError
	 * @param message - Error message (default: 'Auction slot expired')
	 */
	constructor(message: string = 'Auction slot expired') {
		super(message);
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, AuctionSlotExpiredError);
		}
	}
}

interface SignOrderMsgParams {
	/** Wallet instance with message signing capability */
	wallet: {
		/** Function to sign a message */
		signMessage: (message: Uint8Array) => Promise<Uint8Array>;
	};
	/** The prefixed bytes to sign, `SwiftOrderMessage.signingBytes` */
	signingBytes: Uint8Array;
	/** Absolute slot after which the order must no longer be signed */
	signingDeadlineSlot: number;
	/** Time in milliseconds till signing must stop */
	expirationTimeMs: number;
	/** Live chain slot; 0 or omitted means the feed is dead */
	slotSource?: () => number;
	/** Callback function called when the signing deadline passes */
	onExpired?: () => void;
}

/**
 * Signs a swift order message with slot expiration monitoring.
 * The real deadline is a slot, so the live slot feed is the authority; the
 * wall-clock timer is only a backstop for a dead feed.
 *
 * @param wallet - Wallet instance with message signing capability
 * @param hexEncodedSwiftOrderMessage - Hex-encoded swift order message to sign
 * @param signingDeadlineSlot - Absolute slot after which the order must no longer be signed
 * @param expirationTimeMs - Time in milliseconds till signing must stop
 * @param slotSource - Live chain slot, polled while the prompt is open
 * @param onExpired - Callback function called when the auction expires
 *
 * @returns Promise resolving to the signed message as Uint8Array
 * @throws {AuctionSlotExpiredError} When the auction slot expires before signing completes
 */
export const signSwiftOrderMsg = async ({
	wallet,
	signingBytes,
	signingDeadlineSlot,
	expirationTimeMs,
	slotSource,
	onExpired,
}: SignOrderMsgParams): Promise<Uint8Array> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let intervalId: ReturnType<typeof setInterval> | undefined;

	try {
		// Sign the message
		const signedMessagePromise = wallet.signMessage(signingBytes);

		const signingExpiredPromise = new Promise<never>((_resolve, reject) => {
			const expire = () => {
				onExpired?.();
				reject(new AuctionSlotExpiredError());
			};

			timeoutId = setTimeout(expire, expirationTimeMs);

			if (slotSource) {
				intervalId = setInterval(() => {
					const slot = slotSource();
					if (slot > 0 && slot >= signingDeadlineSlot) {
						expire();
					}
				}, SIGNING_DEADLINE_POLL_INTERVAL_MS);
			}
		});

		// Ensure that the user signs the message before the expiration time
		const signedMessage = await Promise.race([
			signedMessagePromise,
			signingExpiredPromise,
		]);

		return signedMessage;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (intervalId) {
			clearInterval(intervalId);
		}
	}
};

/**
 * Parameters for sending a swift order to the Swift server
 * @interface SendSwiftOrderParams
 */
interface SendSwiftOrderParams {
	/** The Velocity client instance */
	velocityClient: VelocityClient;
	/** Market identifier for the order */
	marketId: MarketId;
	/** Hex-encoded swift order message as string */
	hexEncodedSwiftOrderMessageString: string;
	/** The signed message from the wallet */
	signedMessage: Uint8Array;
	/** Unique identifier for the signed message order */
	signedMsgOrderUuid: Uint8Array;
	/** Public key of the taker authority */
	takerAuthority: PublicKey;
	/** Public key of the signing authority */
	signingAuthority: PublicKey;
	/** Number of slots till the end of the auction (optional) */
	slotsTillPlacementDeadline: number;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	/** Multiplier for the SWIFT confirmation timeout (after sending SWIFT order) */
	confirmationMultiplier?: number;
	/** Optionally send a different connection for the confirmation step, possibly for a faster commitment */
	confirmationConnection?: Connection;
	/**
	 * Wall time in ms after which the program no longer places the order. When given, the
	 * confirmation wait ends a margin past it rather than after the timeout from send time.
	 */
	placementDeadlineMs?: number;
}

/**
 * Sends a swift order to the Swift server and handles the response.
 * Monitors the order status and calls appropriate callback functions based on the response type.
 *
 * @param velocityClient - The Velocity client instance
 * @param marketId - Market identifier for the order
 * @param hexEncodedSwiftOrderMessageString - Hex-encoded swift order message as string
 * @param signedMessage - The signed message from the wallet
 * @param signedMsgOrderUuid - Unique identifier for the signed message order
 * @param takerAuthority - Public key of the taker authority
 * @param signingAuthority - Public key of the signing authority
 * @param slotsTillPlacementDeadline - Slots from prep until the program stops placing the order
 * @param swiftConfirmationSlotBuffer - Slot buffer for swift server confirmation time (default: 15)
 * @param onExpired - Callback function called when the order expires
 * @param onErrored - Callback function called when the order encounters an error
 * @param onConfirmed - Callback function called when the order is confirmed
 *
 * @returns Promise that resolves when the order processing is complete
 *
 */
export const sendSwiftOrder = ({
	velocityClient,
	marketId,
	hexEncodedSwiftOrderMessageString,
	signedMessage,
	signedMsgOrderUuid,
	takerAuthority,
	signingAuthority,
	slotsTillPlacementDeadline,
	slotDuration,
	confirmationMultiplier,
	confirmationConnection,
	placementDeadlineMs,
}: SendSwiftOrderParams): SwiftOrderObservable => {
	const signedMsgUserOrdersAccountPubkey = getSignedMsgUserAccountPublicKey(
		velocityClient.program.programId,
		takerAuthority
	);

	const swiftOrderObservable = SwiftClient.sendAndConfirmSwiftOrderWS(
		confirmationConnection ?? velocityClient.connection,
		velocityClient,
		marketId.marketIndex,
		marketId.marketType,
		hexEncodedSwiftOrderMessageString,
		Buffer.from(signedMessage),
		takerAuthority,
		signedMsgUserOrdersAccountPubkey,
		signedMsgOrderUuid,
		getSwiftConfirmationTimeoutMs(
			slotsTillPlacementDeadline,
			confirmationMultiplier,
			slotDuration
		),
		signingAuthority,
		placementDeadlineMs === undefined
			? undefined
			: getSwiftConfirmationDeadlineMs(
					placementDeadlineMs,
					confirmationMultiplier
				)
	);

	return swiftOrderObservable;
};

/**
 * The signing window for a prepared order. `signingDeadlineSlot` is the
 * authoritative bound: `expirationTimeMs` is the same window converted at the
 * live duration, a backstop for when the slot feed is dead. Consumers showing
 * a countdown should use these rather than recomputing the window, which would
 * drift from the guard the moment the formula changes.
 */
export type SwiftOrderTiming = {
	slotsTillPlacementDeadline: number;
	signingDeadlineSlot: number;
	expirationTimeMs: number;
};

/**
 * The program places a resting limit until its message slot, which prep stamps ahead by the
 * signing budget. Any other order it places until `SIGNED_MSG_FILL_WINDOW_MS` past its
 * message slot, which prep stamps at the current slot. Both windows run from prep time.
 */
const computeSwiftOrderTiming = (
	mainOrderParams: OptionalOrderParams,
	userSigningSlotBuffer: number,
	currentSlot: number,
	slotDuration: SlotDurationMs
): SwiftOrderTiming => {
	const slotsTillPlacementDeadline = isRestingLimit(mainOrderParams)
		? userSigningSlotBuffer
		: msToSlotsCeilNum(SIGNED_MSG_FILL_WINDOW_MS, slotDuration);
	const signingWindowSlots = Math.max(
		slotsTillPlacementDeadline - SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS,
		MINIMUM_SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS
	);

	return {
		slotsTillPlacementDeadline,
		signingDeadlineSlot: currentSlot + signingWindowSlots,
		expirationTimeMs: slotsToMsNum(signingWindowSlots, slotDuration),
	};
};

/** `place_signed_msg_taker_order` treats a plain limit as resting from placement. */
function isRestingLimit(orderParams: OptionalOrderParams): boolean {
	return ENUM_UTILS.match(orderParams.orderType, OrderType.LIMIT);
}

type PrepSwiftOrderMessageParams = {
	velocityClient: VelocityClient;
	subAccountId: number;
	userAccountPubKey: PublicKey;
	marketIndex: number;
	userSigningSlotBuffer: number;
	slotDuration: SlotDurationMs;
	isDelegate?: boolean;
	orderParams: {
		main: OptionalOrderParams;
		takeProfit?: OptionalTriggerOrderParams;
		stopLoss?: OptionalTriggerOrderParams;
		positionMaxLeverage?: number;
		isolatedPositionDeposit?: BN;
	};
	builderParams?: {
		builderIdx: number;
		builderFeeTenthBps: number;
	};
};

/**
 * Prepares a SWIFT order message without signing or sending it.
 * Returns all data needed for the consumer to sign and send the order themselves.
 *
 * This is useful for server-side contexts (e.g., CentralServerVelocity) where
 * the server prepares the message but the client handles signing and sending.
 */
export const prepSwiftOrderMessage = async ({
	velocityClient,
	subAccountId,
	userAccountPubKey,
	marketIndex,
	userSigningSlotBuffer,
	slotDuration,
	isDelegate = false,
	orderParams,
	builderParams,
}: PrepSwiftOrderMessageParams): Promise<SwiftOrderMessage> => {
	const [currentSlot, route] = await Promise.all([
		velocityClient.connection.getSlot('confirmed'),
		velocityClient.getCustomQuoterRoute(marketIndex),
	]);

	const {
		hexEncodedSwiftOrderMessage,
		signingBytes,
		signedMsgOrderUuid,
		signedMsgOrderParamsMessage,
		slotForSignedMsg,
		resolvedUserSigningSlotBuffer,
	} = prepSwiftOrder({
		velocityClient,
		takerUserAccount: {
			pubKey: userAccountPubKey,
			subAccountId,
		},
		currentSlot,
		slotDuration,
		isDelegate,
		orderParams,
		userSigningSlotBuffer,
		builderParams,
		route,
	});

	const preppedAtMs = Date.now();
	const { slotsTillPlacementDeadline, signingDeadlineSlot, expirationTimeMs } =
		computeSwiftOrderTiming(
			orderParams.main,
			resolvedUserSigningSlotBuffer,
			currentSlot,
			slotDuration
		);

	return {
		hexEncodedSwiftOrderMessage,
		signingBytes,
		signedMsgOrderParamsMessage,
		slotForSignedMsg,
		signedMsgOrderUuid,
		marketIndex,
		slotsTillPlacementDeadline,
		placementDeadlineMs: getSwiftPlacementDeadlineMs(
			preppedAtMs,
			slotsTillPlacementDeadline,
			slotDuration
		),
		signingDeadlineSlot,
		expirationTimeMs,
	};
};

type PrepSignAndSendSwiftOrderParams = {
	velocityClient: VelocityClient;
	subAccountId: number;
	userAccountPubKey: PublicKey;
	marketIndex: number;
	userSigningSlotBuffer: number;
	slotDuration: SlotDurationMs;
	swiftOptions: SwiftOrderOptions;
	/** Multiplier for the SWIFT confirmation timeout (after sending SWIFT order). Default is 1.
	 *
	 * Higher multiplier means longer confirmation timeout.
	 */
	confirmationMultiplier?: number;
	confirmationConnection?: Connection;
	orderParams: {
		main: OptionalOrderParams;
		takeProfit?: OptionalTriggerOrderParams;
		stopLoss?: OptionalTriggerOrderParams;
		/**
		 * Adjusts the max leverage of a position.
		 */
		positionMaxLeverage?: number;
		/**
		 * Optional isolated position deposit amount for isolated positions.
		 */
		isolatedPositionDeposit?: BN;
	};
	/**
	 * Optional builder code parameters for revenue sharing.
	 * If provided, the builder will receive a portion of the trading fees.
	 *
	 * Prerequisites:
	 * - User must have initialized a RevenueShareEscrow account
	 * - Builder must be in the user's approved_builders list
	 * - builderFeeTenthBps must not exceed the builder's max_fee_tenth_bps
	 *
	 * @example
	 * ```typescript
	 * builderParams: {
	 *   builderIdx: 0,          // First builder in approved list
	 *   builderFeeTenthBps: 50  // 5 bps = 0.05%
	 * }
	 * ```
	 */
	builderParams?: {
		/**
		 * Index of the builder in the user's approved_builders list.
		 */
		builderIdx: number;
		/**
		 * Fee to charge for this order, in tenths of basis points.
		 * Must be <= the builder's max_fee_tenth_bps.
		 */
		builderFeeTenthBps: number;
	};
};

/**
 * Handles the full flow of the swift order, from preparing to signing and sending to the Swift server.
 * Callbacks can be provided to handle the events of the Swift order.
 * Returns a promise that resolves when the Swift order has reached a terminal state (i.e. confirmed, expired, or errored).
 */
export const prepSignAndSendSwiftOrder = async ({
	velocityClient,
	subAccountId,
	userAccountPubKey,
	marketIndex,
	userSigningSlotBuffer,
	slotDuration,
	swiftOptions,
	orderParams,
	builderParams,
	confirmationMultiplier,
}: PrepSignAndSendSwiftOrderParams): Promise<void> => {
	const {
		hexEncodedSwiftOrderMessage,
		signingBytes,
		signedMsgOrderUuid,
		signedMsgOrderParamsMessage,
		slotsTillPlacementDeadline,
		placementDeadlineMs,
		signingDeadlineSlot,
		expirationTimeMs,
	} = await prepSwiftOrderMessage({
		velocityClient,
		subAccountId,
		userAccountPubKey,
		marketIndex,
		userSigningSlotBuffer,
		slotDuration,
		isDelegate: swiftOptions.isDelegate || false,
		orderParams,
		builderParams,
	});

	swiftOptions.callbacks?.onOrderParamsMessagePrepped?.(
		signedMsgOrderParamsMessage,
		{ slotsTillPlacementDeadline, signingDeadlineSlot, expirationTimeMs }
	);

	// Ensure that the user signs the message before the expiration time
	const signedMessage = await signSwiftOrderMsg({
		wallet: swiftOptions.wallet,
		signingBytes,
		signingDeadlineSlot,
		expirationTimeMs,
		slotSource: swiftOptions.slotSource,
		onExpired: () =>
			swiftOptions.callbacks?.onSigningExpiry?.(signedMsgOrderParamsMessage),
	});

	swiftOptions.callbacks?.onSigningSuccess?.(
		signedMessage,
		signedMsgOrderUuid,
		signedMsgOrderParamsMessage
	);

	// Initialize SwiftClient (required before using sendSwiftOrder)
	SwiftClient.init(swiftOptions.swiftServerUrl, swiftOptions.source ?? '');

	// Create a promise-based wrapper for the sendSwiftOrder callback-based API
	const swiftOrderObservable = sendSwiftOrder({
		velocityClient,
		marketId: MarketId.createPerpMarket(marketIndex),
		hexEncodedSwiftOrderMessageString: hexEncodedSwiftOrderMessage.string,
		signedMessage,
		signedMsgOrderUuid,
		takerAuthority: swiftOptions.wallet.takerAuthority,
		signingAuthority:
			swiftOptions.wallet.signingAuthority ??
			swiftOptions.wallet.takerAuthority,
		slotsTillPlacementDeadline,
		placementDeadlineMs,
		slotDuration,
		confirmationMultiplier,
		confirmationConnection: new Connection(
			velocityClient.connection.rpcEndpoint,
			'processed'
		),
	});

	const wrapSwiftOrderEvent = <T extends SwiftOrderEvent>(
		swiftOrderEvent: T
	) => {
		return {
			...swiftOrderEvent,
			swiftOrderUuid: signedMsgOrderUuid,
			orderParamsMessage: signedMsgOrderParamsMessage,
		};
	};

	let promiseResolver: (value: void | PromiseLike<void>) => void;
	const promise = new Promise<void>((resolve) => {
		promiseResolver = resolve;
	});

	const handleTerminalEvent = (subscription: Subscription) => {
		subscription.unsubscribe();
		promiseResolver();
	};

	const subscription = swiftOrderObservable.subscribe((swiftOrderEvent) => {
		if (swiftOrderEvent.type === 'sent') {
			swiftOptions.callbacks?.onSent?.(wrapSwiftOrderEvent(swiftOrderEvent));
		}
		if (swiftOrderEvent.type === 'confirmed') {
			swiftOptions.callbacks?.onConfirmed?.(
				wrapSwiftOrderEvent(swiftOrderEvent)
			);
			handleTerminalEvent(subscription);
		}
		if (swiftOrderEvent.type === 'expired') {
			swiftOptions.callbacks?.onExpired?.(wrapSwiftOrderEvent(swiftOrderEvent));
			handleTerminalEvent(subscription);
		}
		if (swiftOrderEvent.type === 'errored') {
			swiftOptions.callbacks?.onErrored?.(wrapSwiftOrderEvent(swiftOrderEvent));
			handleTerminalEvent(subscription);
		}
	});

	return promise;
};

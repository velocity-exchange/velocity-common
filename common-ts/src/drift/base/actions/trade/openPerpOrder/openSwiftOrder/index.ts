import {
	getSignedMsgUserAccountPublicKey,
	OrderType,
	SignedMsgOrderParamsDelegateMessage,
	SignedMsgOrderParamsMessage,
} from '@velocity-exchange/sdk';
import {
	BN,
	VelocityClient,
	generateSignedMsgUuid,
	getOrderParams,
	msToSlotsCeilNum,
	OptionalOrderParams,
	PublicKey,
	SlotDurationMs,
	slotsToMsNum,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../../../../../../utils';
import { getSwiftConfirmationTimeoutMs } from '../../../../../../utils/signedMsgs';
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
 * Time allowed for the user to approve the signing prompt in a wallet UI, before
 * the auction starts. Converted to actual slots at the live slot duration.
 */
export const USER_SIGNING_MESSAGE_BUFFER_MS = 2_800;

/**
 * Whole approval budget for orders without an auction (kink of the SWIFT server
 * handling non-auction orders); enforced on chain, so it ceils.
 */
export const MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS = 14_000;

/**
 * Buffer slots from the end of the auction to prevent the signing of the order message.
 */
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
	 * Buffer slots to account for the user to sign the message. Affects the auction start slot.
	 * If order is not an auction order, it is not encouraged to use this buffer.
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
 * 1. Sign `hexEncodedSwiftOrderMessage.uInt8Array` with the user's wallet
 * 2. Send the signed message along with the other fields to the SWIFT server
 */
export interface SwiftOrderMessage {
	/** The encoded order message in both Uint8Array (for signing) and string (for sending) formats */
	hexEncodedSwiftOrderMessage: {
		uInt8Array: Uint8Array;
		string: string;
	};
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
	/** Number of slots till the auction ends (used for confirmation timeout) */
	slotsTillAuctionEnd: number;
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
	 * Buffer slots to account for the user to sign the message. Affects the auction start slot.
	 * If order is not an auction order, it is not encouraged to use this buffer.
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
 * @param userSigningSlotBuffer - Buffer slots to account for the user to sign the message. Affects the auction start slot. If order is not an auction order, it is not encouraged to use this buffer.
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
}: PrepSwiftOrderParams): {
	hexEncodedSwiftOrderMessage: {
		uInt8Array: Uint8Array;
		string: string;
	};
	signedMsgOrderParamsMessage:
		| SignedMsgOrderParamsMessage
		| SignedMsgOrderParamsDelegateMessage;
	slotForSignedMsg: BN;
	signedMsgOrderUuid: Uint8Array;
	resolvedUserSigningSlotBuffer: number;
} => {
	const mainOrderParams = getOrderParams({
		...orderParams.main,
		auctionDuration: orderParams.main.auctionDuration || null, // swift server expects auctionDuration to be null if not set, won't handle 0
	});

	if (!userSigningSlotBuffer) {
		userSigningSlotBuffer = msToSlotsCeilNum(
			mainOrderParams.auctionDuration
				? USER_SIGNING_MESSAGE_BUFFER_MS
				: MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS,
			slotDuration
		);
	}

	// if it is not an auction order, there should be a minimum buffer used
	if (!mainOrderParams.auctionDuration) {
		userSigningSlotBuffer = Math.max(
			userSigningSlotBuffer,
			msToSlotsCeilNum(
				MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS,
				slotDuration
			)
		);
	}

	// buffer for time the user takes to sign a message and send to the swift server
	const auctionStartSlot = new BN(currentSlot + userSigningSlotBuffer);

	const signedMsgOrderUuid = generateSignedMsgUuid();

	const baseSignedMsgOrderParamsMessage = {
		signedMsgOrderParams: mainOrderParams,
		uuid: signedMsgOrderUuid,
		slot: auctionStartSlot,
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
		signedMsgOrderParamsMessage,
		slotForSignedMsg: auctionStartSlot,
		signedMsgOrderUuid,
		resolvedUserSigningSlotBuffer: userSigningSlotBuffer,
	};
};

/**
 * Error thrown when an auction slot has expired
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
	/** Hex-encoded swift order message to sign */
	hexEncodedSwiftOrderMessage: Uint8Array;
	/** Absolute slot after which the order must no longer be signed */
	signingDeadlineSlot: number;
	/** Time in milliseconds till the auction expires */
	expirationTimeMs: number;
	/** Live chain slot; 0 or omitted means the feed is dead */
	slotSource?: () => number;
	/** Callback function called when the auction expires */
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
 * @param expirationTimeMs - Time in milliseconds till the auction expires
 * @param slotSource - Live chain slot, polled while the prompt is open
 * @param onExpired - Callback function called when the auction expires
 *
 * @returns Promise resolving to the signed message as Uint8Array
 * @throws {AuctionSlotExpiredError} When the auction slot expires before signing completes
 */
export const signSwiftOrderMsg = async ({
	wallet,
	hexEncodedSwiftOrderMessage,
	signingDeadlineSlot,
	expirationTimeMs,
	slotSource,
	onExpired,
}: SignOrderMsgParams): Promise<Uint8Array> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let intervalId: ReturnType<typeof setInterval> | undefined;

	try {
		// Sign the message
		const signedMessagePromise = wallet.signMessage(
			hexEncodedSwiftOrderMessage
		);

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
	slotsTillAuctionEnd: number;
	/** Live slot duration, resolved by the caller from `State` */
	slotDuration: SlotDurationMs;
	/** Multiplier for the SWIFT confirmation timeout (after sending SWIFT order) */
	confirmationMultiplier?: number;
	/** Optionally send a different connection for the confirmation step, possibly for a faster commitment */
	confirmationConnection?: Connection;
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
 * @param slotsTillAuctionEnd - Number of slots till the end of the auction (optional)
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
	slotsTillAuctionEnd,
	slotDuration,
	confirmationMultiplier,
	confirmationConnection,
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
			slotsTillAuctionEnd,
			confirmationMultiplier,
			slotDuration
		),
		signingAuthority
	);

	return swiftOrderObservable;
};

/**
 * Computes the timing parameters for a SWIFT order:
 * - slotsTillAuctionEnd: how many slots until the auction is considered ended
 * - signingDeadlineSlot: the absolute slot the signature must land before
 * - expirationTimeMs: the same window in ms, a backstop for a dead slot feed
 *
 * For market orders, auction duration + signing buffer is used directly.
 * For non-market orders, a minimum is enforced because limit auctions can have
 * very small durations but the order is still valid after the auction ends.
 *
 * The deadline is anchored on the prep `currentSlot`, not on the order's own
 * slot, because `slotsTillAuctionEnd` already includes the signing buffer.
 */
/**
 * The signing window for a prepared order. `signingDeadlineSlot` is the
 * authoritative bound: `expirationTimeMs` is the same window converted at the
 * live duration, a backstop for when the slot feed is dead. Consumers showing
 * a countdown should use these rather than recomputing the window, which would
 * drift from the guard the moment the formula changes.
 */
export type SwiftOrderTiming = {
	slotsTillAuctionEnd: number;
	signingDeadlineSlot: number;
	expirationTimeMs: number;
};

const computeSwiftOrderTiming = (
	mainOrderParams: OptionalOrderParams,
	userSigningSlotBuffer: number,
	currentSlot: number,
	slotDuration: SlotDurationMs
): SwiftOrderTiming => {
	const isMarketOrder =
		ENUM_UTILS.match(mainOrderParams.orderType, OrderType.ORACLE) ||
		ENUM_UTILS.match(mainOrderParams.orderType, OrderType.MARKET);
	const minimumNonAuctionSlots = msToSlotsCeilNum(
		MINIMUM_SWIFT_NON_AUCTION_ORDER_SIGNING_BUDGET_MS,
		slotDuration
	);
	const slotsTillAuctionEnd = mainOrderParams.auctionDuration
		? isMarketOrder
			? userSigningSlotBuffer + mainOrderParams.auctionDuration
			: Math.max(
					minimumNonAuctionSlots,
					userSigningSlotBuffer + mainOrderParams.auctionDuration
				)
		: minimumNonAuctionSlots;

	// The minimum floor can exceed a very short auction, which would put the
	// deadline at or past the auction end and let the guard pass an order that
	// can no longer fill. Cap it one slot short of the end so the deadline is
	// always strictly inside the window. No-op for the durations in use today.
	const signingWindowSlots = Math.min(
		Math.max(
			slotsTillAuctionEnd - SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS,
			MINIMUM_SWIFT_ORDER_SIGNING_EXPIRATION_BUFFER_SLOTS
		),
		slotsTillAuctionEnd - 1
	);

	return {
		slotsTillAuctionEnd,
		signingDeadlineSlot: currentSlot + signingWindowSlots,
		expirationTimeMs: slotsToMsNum(signingWindowSlots, slotDuration),
	};
};

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
	const currentSlot = await velocityClient.connection.getSlot('confirmed');

	const {
		hexEncodedSwiftOrderMessage,
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
	});

	const { slotsTillAuctionEnd, signingDeadlineSlot, expirationTimeMs } =
		computeSwiftOrderTiming(
			orderParams.main,
			resolvedUserSigningSlotBuffer,
			currentSlot,
			slotDuration
		);

	return {
		hexEncodedSwiftOrderMessage,
		signedMsgOrderParamsMessage,
		slotForSignedMsg,
		signedMsgOrderUuid,
		marketIndex,
		slotsTillAuctionEnd,
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
		signedMsgOrderUuid,
		signedMsgOrderParamsMessage,
		slotsTillAuctionEnd,
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
		{ slotsTillAuctionEnd, signingDeadlineSlot, expirationTimeMs }
	);

	// Ensure that the user signs the message before the expiration time
	const signedMessage = await signSwiftOrderMsg({
		wallet: swiftOptions.wallet,
		hexEncodedSwiftOrderMessage: hexEncodedSwiftOrderMessage.uInt8Array,
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
		slotsTillAuctionEnd,
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

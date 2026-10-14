import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import {
	VelocityClient,
	MarketType,
	OrderType,
	SignedMsgOrderParamsDelegateMessage,
	SignedMsgOrderParamsMessage,
	SignedMsgUserOrdersAccount,
	digestSignature,
	isVariant,
} from '@velocity-exchange/sdk';

import { Observable, Subscriber } from 'rxjs';
import { logger } from '../utils/logger';
export type SwiftServerOrderProcessResponse = {
	error?: string;
	message: string;
};

type ClientResponse<T = void> = Promise<{
	success: boolean;
	body?: T;
	message?: string;
	status?: number;
}>;

type BaseSwiftOrderEvent = {
	hash: string;
};

export interface SwiftOrderSentEvent extends BaseSwiftOrderEvent {
	type: 'sent';
}

export interface SwiftOrderErroredEvent extends BaseSwiftOrderEvent {
	type: 'errored' | 'expired';
	message?: string;
	status?: number;
}

export interface SwiftOrderConfirmedEvent extends BaseSwiftOrderEvent {
	type: 'confirmed';
	orderId: string;
}

export type SwiftOrderEvent =
	| SwiftOrderErroredEvent
	| SwiftOrderConfirmedEvent
	| SwiftOrderSentEvent;

/** What the confirmation server says about an order once it stops being pending. */
export type SwiftConfirmation =
	| { status: 'confirmed'; orderId: string }
	| { status: 'failed'; reason: string }
	| { status: 'expired' };

const CONFIRMATION_POLL_INTERVAL_MS = 1_000;

/** The time a last RPC check may take after the deadline before the hard bound fires. */
const CONFIRMATION_GRACE_MS = 2_000;

const ORDER_EXPIRED_MESSAGE =
	'The order was not placed before its placement deadline';

const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export type SwiftOrderEventWithParams<T extends SwiftOrderEvent> = T & {
	swiftOrderUuid: Uint8Array;
	orderParamsMessage:
		| SignedMsgOrderParamsMessage
		| SignedMsgOrderParamsDelegateMessage;
};

export class SwiftClient {
	private static baseUrl = '';
	private static swiftClientConsumer?: string;

	static supportedOrderTypes: OrderType[] = [OrderType.MARKET, OrderType.LIMIT];

	public static init(baseUrl: string, swiftClientConsumer?: string) {
		this.baseUrl = baseUrl;
		this.swiftClientConsumer = swiftClientConsumer;
	}

	/** A request still open after `timeoutMs` is aborted and reads as a network error. */
	private static get(url: string, timeoutMs?: number) {
		if (!this.baseUrl) {
			throw new Error('SwiftClient not initialized');
		}

		return new Promise<{ success: boolean; body: string; status: number }>(
			(res) => {
				const headers = new Headers({
					...this.getSwiftHeaders(),
				});

				const controller = new AbortController();
				const timeout =
					timeoutMs === undefined
						? undefined
						: setTimeout(() => controller.abort(), Math.max(0, timeoutMs));

				fetch(`${this.baseUrl}${url}`, {
					headers,
					signal: controller.signal,
				})
					.then(async (response) => {
						if (!response.ok) {
							res({
								success: false,
								body: await response.text(),
								status: response.status,
							});
							return;
						}
						res({
							success: true,
							body: await response.text(),
							status: response.status,
						});
					})
					.catch((err) => {
						res({ success: false, body: err, status: 0 });
					})
					.finally(() => clearTimeout(timeout));
			}
		);
	}

	private static post(url: string, bodyObject: any) {
		if (!this.baseUrl) {
			throw new Error('SwiftClient not initialized');
		}

		const requestOptions = {
			method: 'POST',
			headers: { ...this.getSwiftHeaders() },
			body: JSON.stringify(bodyObject),
		};

		return new Promise<{
			success: boolean;
			body: SwiftServerOrderProcessResponse;
			status: number;
		}>((res) => {
			const postRequest = new Request(`${this.baseUrl}${url}`, requestOptions);

			fetch(postRequest)
				.then(async (response) => {
					let resBody: SwiftServerOrderProcessResponse | null = null;
					try {
						resBody =
							(await response.json()) as SwiftServerOrderProcessResponse;

						res({
							success: response.ok,
							body: resBody,
							status: response.status,
						});
					} catch (err) {
						logger.debug('swiftClient', 'Error reading response body', err);

						res({
							success: false,
							body: err as any,
							status: response.status,
						});
					}
				})
				.catch((err) => {
					res({ success: false, body: err, status: 0 });
				});
		});
	}

	static async sendSwiftOrder(
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		signingAuthority?: PublicKey
	): ClientResponse<{
		hash: string;
	}> {
		const requestPayload = {
			market_index: marketIndex,
			market_type: isVariant(marketType, 'perp') ? 'perp' : 'spot',
			message,
			signature: signature.toString('base64'),
			signing_authority: signingAuthority?.toBase58() ?? '',
			taker_authority: takerPubkey.toBase58(),
		};

		const response = await this.post('/orders', requestPayload);

		if (response.status !== 200) {
			logger.error(
				`Non-200 status code received for sent Swift order: ${response.status}`
			);
			logger.debug('swiftClient', 'full non-200 response body', response.body);
			return {
				message:
					response.body?.error ||
					response.body?.message ||
					`HTTP ${response.status}: Error from Swift server`,
				status: response.status,
				success: false,
			};
		}

		return {
			message: `Successfully sent Swift order`,
			body: {
				hash: digestSignature(Uint8Array.from(signature)),
			},
			success: true,
			status: 200,
		};
	}

	static async confirmSwiftOrderWS(
		connection: Connection,
		client: VelocityClient,
		signedMsgUserOrdersAccount: PublicKey,
		signedMsgOrderUuid: Uint8Array,
		confirmDuration: number,
		signal?: AbortSignal
	): Promise<number | undefined> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let subId: number | undefined = undefined;
			let pollInterval: ReturnType<typeof setInterval> | undefined = undefined;

			const finalizeResolve = (orderId: number) => {
				if (settled) return;
				settled = true;
				if (subId !== undefined) {
					connection.removeAccountChangeListener(subId).catch(() => {});
				}
				clearTimeout(timeout);

				if (pollInterval) {
					clearInterval(pollInterval);
				}

				resolve(orderId);
			};

			const finalizeReject = (error: Error) => {
				if (settled) return;
				settled = true;
				if (subId !== undefined) {
					connection.removeAccountChangeListener(subId).catch(() => {});
				}
				clearTimeout(timeout);

				if (pollInterval) {
					clearInterval(pollInterval);
				}

				reject(error);
			};

			const checkOrder = async (
				confirmType: 'initial' | 'poll' | 'timeout'
			) => {
				try {
					const lastOrderId = await this.confirmSwiftOrderRPCFetch(
						connection,
						client,
						signedMsgUserOrdersAccount,
						signedMsgOrderUuid
					);
					if (lastOrderId !== undefined) {
						logger.debug(
							'swiftClient',
							`confirmed in ${confirmType} RPC fetch orderID\n`,
							lastOrderId
						);
						finalizeResolve(lastOrderId);
					}
				} catch (err) {
					logger.debug('swiftClient', `${confirmType} RPC fetch error`, err);
				}
			};

			const timeout = setTimeout(async () => {
				await checkOrder('timeout');

				if (!settled) {
					finalizeReject(new Error('Order not found'));
				}
			}, confirmDuration);

			signal?.addEventListener('abort', () =>
				finalizeReject(new Error('Confirmation aborted'))
			);

			// Perform an initial check.
			checkOrder('initial');

			// Poll every 2 seconds as backup for unreliable websocket.
			pollInterval = setInterval(() => checkOrder('poll'), 2000);

			// Subscribe for account change confirmations via WS.
			subId = connection.onAccountChange(
				signedMsgUserOrdersAccount,
				(accountInfo) => {
					const order = this.findOrderInSignedMsgUserOrdersAccount(
						client,
						accountInfo,
						signedMsgOrderUuid
					);
					if (order) {
						logger.debug(
							'swiftClient',
							'confirmed in onAccountChange orderID\n',
							order.orderId
						);
						finalizeResolve(order.orderId);
					}
				}
			);
		});
	}

	private static async confirmSwiftOrderRPCFetch(
		connection: Connection,
		client: VelocityClient,
		signedMsgUserOrdersAccount: PublicKey,
		signedMsgOrderUuid: Uint8Array
	): Promise<number | undefined> {
		const accountInfo = await connection.getAccountInfo(
			signedMsgUserOrdersAccount
		);
		if (!accountInfo) {
			return undefined;
		}
		const order = this.findOrderInSignedMsgUserOrdersAccount(
			client,
			accountInfo,
			signedMsgOrderUuid
		);
		return order?.orderId;
	}

	static findOrderInSignedMsgUserOrdersAccount(
		client: VelocityClient,
		ordersAccount: AccountInfo<Buffer>,
		signedMsgOrderUuid: Uint8Array
	) {
		// TODO: cast to any to avoid "Type instantiation is excessively deep and possibly infinite." error from Anchor's generic types against the Velocity IDL. Fix once SDK is stable.
		const program = client.program as any;
		const accountDecoder =
			program.account.signedMsgUserOrders.coder.accounts.decodeUnchecked.bind(
				program.account.signedMsgUserOrders.coder.accounts
			);
		const decodedAccount = accountDecoder(
			'signedMsgUserOrders',
			ordersAccount.data
		) as SignedMsgUserOrdersAccount;
		logger.debug(
			'swiftClient findOrder',
			'decodedAccount\n',
			decodedAccount,
			signedMsgOrderUuid.toString()
		);
		const order = decodedAccount.signedMsgOrderData.find(
			(order) => order.uuid.toString() === signedMsgOrderUuid.toString()
		);
		logger.debug('swiftClient findOrder', 'order\n', order);
		return order;
	}

	/**
	 * Polls the confirmation server until it answers for the order or the deadline passes.
	 * A 5xx or a network error is transient, so polling goes on. Only the deadline ends a
	 * silent or failing server.
	 */
	static async confirmSwiftOrder(
		hash: string,
		confirmDuration: number,
		options?: { deadlineMs?: number; signal?: AbortSignal }
	): ClientResponse<SwiftConfirmation> {
		const deadlineMs = options?.deadlineMs ?? Date.now() + confirmDuration;
		const url = `/confirmation/hash-status?hash=${encodeURIComponent(hash)}`;

		while (Date.now() < deadlineMs && !options?.signal?.aborted) {
			const confirmResponse = await this.get(url, deadlineMs - Date.now());

			if (confirmResponse.status === 200) {
				logger.debug('Confirmed hash: ', hash);
				return {
					success: true,
					status: 200,
					message: `Confirmed hash: ${hash}`,
					body: {
						orderId: confirmResponse.body,
						status: 'confirmed',
					},
				};
			}

			if (confirmResponse.status === 422) {
				logger.error('Swift order placement failed: ', confirmResponse.body);
				return {
					success: false,
					status: 422,
					message: confirmResponse.body,
					body: {
						status: 'failed',
						reason: confirmResponse.body,
					},
				};
			}

			await sleep(
				Math.min(CONFIRMATION_POLL_INTERVAL_MS, deadlineMs - Date.now())
			);
		}

		logger.error('Failed to confirm hash: ', hash);
		return {
			success: false,
			status: 408,
			message: ORDER_EXPIRED_MESSAGE,
			body: {
				status: 'expired',
			},
		};
	}

	private static emitConfirmation(
		subscriber: Subscriber<SwiftOrderEvent>,
		hash: string,
		confirmation: SwiftConfirmation
	) {
		if (confirmation.status === 'confirmed') {
			subscriber.next({
				type: 'confirmed',
				orderId: confirmation.orderId,
				hash,
			});
			subscriber.complete();
			return;
		}

		subscriber.next(
			confirmation.status === 'failed'
				? { type: 'errored', hash, message: confirmation.reason, status: 422 }
				: {
						type: 'expired',
						hash,
						message: ORDER_EXPIRED_MESSAGE,
						status: 408,
					}
		);
		subscriber.error();
	}

	/**
	 * Wraps a send and confirm flow so it always ends by `deadlineMs`, even when the
	 * server never answers or the flow throws.
	 */
	private static boundedSwiftOrderObservable(
		deadlineMs: number,
		run: (subscriber: Subscriber<SwiftOrderEvent>) => Promise<void>
	): Observable<SwiftOrderEvent> {
		return new Observable<SwiftOrderEvent>((subscriber) => {
			const hardBound = setTimeout(
				() => {
					if (subscriber.closed) return;
					this.emitConfirmation(subscriber, '', { status: 'expired' });
				},
				deadlineMs - Date.now() + CONFIRMATION_GRACE_MS
			);

			run(subscriber).catch((err) => {
				logger.error('swiftClient', 'swift order flow failed', err);
				if (subscriber.closed) return;
				subscriber.next({
					type: 'errored',
					hash: '',
					message: err instanceof Error ? err.message : String(err),
				});
				subscriber.error();
			});

			return () => clearTimeout(hardBound);
		});
	}

	private static async handleSwiftOrderSubscriber(
		subscriber: Subscriber<SwiftOrderEvent>,
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		deadlineMs: number,
		signingAuthority?: PublicKey
	) {
		const sendResponse = await this.sendSwiftOrder(
			marketIndex,
			marketType,
			message,
			signature,
			takerPubkey,
			signingAuthority
		);

		if (subscriber.closed) return;

		if (!sendResponse.success) {
			subscriber.next({
				type: 'errored',
				hash: '',
				message: sendResponse.message,
				status: sendResponse.status,
			});
			subscriber.error();
			return;
		}

		const hash = sendResponse.body!.hash;
		subscriber.next({ type: 'sent', hash });

		const confirmResponse = await this.confirmSwiftOrder(hash, 0, {
			deadlineMs,
		});

		if (subscriber.closed) return;

		this.emitConfirmation(subscriber, hash, confirmResponse.body!);
	}

	/**
	 * Confirms through the order's onchain entry and the confirmation server at once.
	 * The chain is the authority for a placed order. Only the server can report a
	 * placement that failed, so its answer ends the wait early.
	 */
	private static async handleSwiftOrderSubscriberWS(
		subscriber: Subscriber<SwiftOrderEvent>,
		connection: Connection,
		client: VelocityClient,
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		signedMsgUserOrdersAccountPubkey: PublicKey,
		signedMsgOrderUuid: Uint8Array,
		deadlineMs: number,
		signingAuthority?: PublicKey
	) {
		const sendResponse = await this.sendSwiftOrder(
			marketIndex,
			marketType,
			message,
			signature,
			takerPubkey,
			signingAuthority
		);
		logger.debug('swiftClient', 'sendResponse\n', sendResponse);

		if (subscriber.closed) return;

		if (!sendResponse.success) {
			subscriber.next({
				type: 'errored',
				hash: '',
				message: `Error from swift node: ${sendResponse.message}`,
				status: sendResponse.status,
			});
			subscriber.error();
			return;
		}

		const hash = sendResponse.body!.hash;
		subscriber.next({ type: 'sent', hash });

		const controller = new AbortController();
		const confirmation = await new Promise<SwiftConfirmation>((resolve) => {
			this.confirmSwiftOrderWS(
				connection,
				client,
				signedMsgUserOrdersAccountPubkey,
				signedMsgOrderUuid,
				Math.max(0, deadlineMs - Date.now()),
				controller.signal
			)
				.then((orderId) =>
					resolve(
						orderId === undefined
							? { status: 'expired' }
							: { status: 'confirmed', orderId: orderId.toString() }
					)
				)
				.catch((err) => {
					logger.debug('swiftClient', 'confirmSwiftOrderWS error', err);
					resolve({ status: 'expired' });
				});

			this.confirmSwiftOrder(hash, 0, {
				deadlineMs,
				signal: controller.signal,
			})
				.then((response) => {
					if (response.body && response.body.status !== 'expired') {
						resolve(response.body);
					}
				})
				.catch((err) => {
					logger.debug('swiftClient', 'confirmSwiftOrder error', err);
				});
		});
		controller.abort();

		if (subscriber.closed) return;

		this.emitConfirmation(subscriber, hash, confirmation);
	}

	/**
	 * `deadlineMs` is the wall time after which the order can no longer be placed, plus a
	 * margin to observe it. When it is absent, the wait is `confirmDuration` from now.
	 */
	public static sendAndConfirmSwiftOrder(
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		confirmDuration: number,
		signingAuthority: PublicKey,
		deadlineMs?: number
	): Observable<SwiftOrderEvent> {
		const resolvedDeadlineMs = deadlineMs ?? Date.now() + confirmDuration;
		return this.boundedSwiftOrderObservable(resolvedDeadlineMs, (subscriber) =>
			this.handleSwiftOrderSubscriber(
				subscriber,
				marketIndex,
				marketType,
				message,
				signature,
				takerPubkey,
				resolvedDeadlineMs,
				signingAuthority
			)
		);
	}

	/** `deadlineMs` works as in `sendAndConfirmSwiftOrder`. */
	public static sendAndConfirmSwiftOrderWS(
		connection: Connection,
		client: VelocityClient,
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		signedMsgUserOrdersAccountPubkey: PublicKey,
		signedMsgOrderUuid: Uint8Array,
		confirmDuration: number,
		signingAuthority: PublicKey,
		deadlineMs?: number
	): Observable<SwiftOrderEvent> {
		const resolvedDeadlineMs = deadlineMs ?? Date.now() + confirmDuration;
		return this.boundedSwiftOrderObservable(resolvedDeadlineMs, (subscriber) =>
			this.handleSwiftOrderSubscriberWS(
				subscriber,
				connection,
				client,
				marketIndex,
				marketType,
				message,
				signature,
				takerPubkey,
				signedMsgUserOrdersAccountPubkey,
				signedMsgOrderUuid,
				resolvedDeadlineMs,
				signingAuthority
			)
		);
	}

	public static async isSwiftServerHealthy(): Promise<boolean> {
		const response = await this.get('/health');
		return response.status === 200;
	}

	private static getSwiftHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
			'X-Swift-Client-Consumer': this.swiftClientConsumer ?? 'default',
		};
	}

	public static isSupportedOrderType(orderType: OrderType) {
		return this.supportedOrderTypes.includes(orderType);
	}
}

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

	private static get(url: string) {
		if (!this.baseUrl) {
			throw new Error('SwiftClient not initialized');
		}

		return new Promise<{ success: boolean; body: string; status: number }>(
			(res) => {
				const headers = new Headers({
					...this.getSwiftHeaders(),
				});

				fetch(`${this.baseUrl}${url}`, {
					headers,
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
					});
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
		confirmDuration: number
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

	static async confirmSwiftOrder(
		hash: string,
		confirmDuration: number
	): Promise<
		ClientResponse<
			| {
					orderId: string;
					status: 'confirmed';
			  }
			| {
					status: 'expired';
			  }
		>
	> {
		const expireTime = Date.now() + confirmDuration;

		while (Date.now() < expireTime) {
			const confirmResponse = await this.get(
				`/confirmation/hash-status?hash=${encodeURIComponent(hash)}`
			);

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
			} else if (
				confirmResponse.status >= 500 ||
				confirmResponse.status < 200
			) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		logger.error('Failed to confirm hash: ', hash);
		return {
			success: false,
			status: 408,
			message: `Failed to confirm hash: ${hash}`,
			body: {
				status: 'expired',
			},
		};
	}

	static async handleSwiftOrderSubscriber(
		subscriber: Subscriber<SwiftOrderEvent>,
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		confirmDuration: number,
		signingAuthority?: PublicKey
	) {
		// First send the order
		const sendResponse = await this.sendSwiftOrder(
			marketIndex,
			marketType,
			message,
			signature,
			takerPubkey,
			signingAuthority
		);

		if (!sendResponse.success) {
			subscriber.next({
				type: 'errored',
				hash: '',
				message: sendResponse.message,
				status: sendResponse.status,
			});
			subscriber.error();
			return;
		} else {
			subscriber.next({
				type: 'sent',
				hash: sendResponse.body!.hash,
			});
		}

		const hash = sendResponse.body!.hash;

		// Then confirm it
		const confirmResponse = await this.confirmSwiftOrder(hash, confirmDuration);

		if (!confirmResponse.success) {
			subscriber.next({
				type: confirmResponse.body!.status as 'expired',
				hash,
				message: confirmResponse.message,
				status: confirmResponse.status,
			});
			subscriber.error();
		}
		if (confirmResponse.body!.status === 'confirmed') {
			subscriber.next({
				type: 'confirmed',
				orderId: (
					confirmResponse.body as { orderId: string; status: 'confirmed' }
				).orderId,
				hash,
			});
			subscriber.complete();
		}
	}
	static async handleSwiftOrderSubscriberWS(
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
		confirmDuration: number,
		signingAuthority?: PublicKey
	) {
		// First send the order
		const sendResponse = await this.sendSwiftOrder(
			marketIndex,
			marketType,
			message,
			signature,
			takerPubkey,
			signingAuthority
		);
		logger.debug('swiftClient', 'sendResponse\n', sendResponse);

		if (!sendResponse.success) {
			subscriber.next({
				type: 'errored',
				hash: '',
				message: `Error from swift node: ${sendResponse.message}`,
				status: sendResponse.status,
			});
			subscriber.error();
			return;
		} else {
			subscriber.next({
				type: 'sent',
				hash: sendResponse.body!.hash,
			});
		}

		const hash = sendResponse.body!.hash;

		// Then confirm it
		const orderID = await this.confirmSwiftOrderWS(
			connection,
			client,
			signedMsgUserOrdersAccountPubkey,
			signedMsgOrderUuid,
			confirmDuration
		).catch((err) => {
			logger.debug('swiftClient', 'confirmSwiftOrderWS error', err);
			subscriber.next({
				type: 'expired',
				hash,
				message: 'Order failed to confirm',
				status: 408,
			});
			subscriber.error();
		});

		if (!orderID) {
			subscriber.next({
				type: 'expired',
				hash,
				message: 'Order failed to confirm',
				status: 408,
			});
			subscriber.error();
		} else {
			subscriber.next({
				type: 'confirmed',
				orderId: orderID.toString(),
				hash,
			});
			subscriber.complete();
		}
	}

	public static sendAndConfirmSwiftOrder(
		marketIndex: number,
		marketType: MarketType,
		message: string,
		signature: Buffer,
		takerPubkey: PublicKey,
		confirmDuration: number,
		signingAuthority: PublicKey
	): Observable<SwiftOrderEvent> {
		return new Observable<SwiftOrderEvent>((subscriber) => {
			this.handleSwiftOrderSubscriber(
				subscriber,
				marketIndex,
				marketType,
				message,
				signature,
				takerPubkey,
				confirmDuration,
				signingAuthority
			);
		});
	}

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
		signingAuthority: PublicKey
	): Observable<SwiftOrderEvent> {
		return new Observable<SwiftOrderEvent>((subscriber) => {
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
				confirmDuration,
				signingAuthority
			);
		});
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

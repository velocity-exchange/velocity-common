import { expect } from 'chai';
import { Observable } from 'rxjs';
import { Connection } from '@solana/web3.js';
import {
	MarketType,
	PublicKey,
	SlotDurationMs,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { SwiftClient, SwiftOrderEvent } from '../../src/clients/swiftClient';
import {
	getSwiftConfirmationDeadlineMs,
	getSwiftPlacementDeadlineMs,
	SWIFT_CONFIRMATION_ROUND_TRIP_MS,
} from '../../src/utils/signedMsgs';

type StubResponse = { status: number; body: string } | 'network-error' | 'hang';

const BASE_URL = 'http://swift.test';
const HASH = 'abc+/=';

const originalFetch = globalThis.fetch;

/** Answers each hash-status poll with the next response, repeating the last one. */
function stubFetch(
	statusResponses: StubResponse[],
	orderResponse: StubResponse = { status: 200, body: '{"message":"ok"}' }
) {
	const statusUrls: string[] = [];

	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : input.toString();
		const signal = input instanceof Request ? input.signal : init?.signal;

		let response = orderResponse;
		if (url.includes('/confirmation/hash-status')) {
			statusUrls.push(url);
			response =
				statusResponses[
					Math.min(statusUrls.length, statusResponses.length) - 1
				];
		}

		if (response === 'network-error') {
			return Promise.reject(new TypeError('fetch failed'));
		}

		if (response === 'hang') {
			return new Promise((_resolve, reject) => {
				signal?.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError'))
				);
			});
		}

		return Promise.resolve(
			new Response(response.body, { status: response.status })
		);
	}) as typeof fetch;

	return statusUrls;
}

function collectEvents(observable: Observable<SwiftOrderEvent>) {
	return new Promise<SwiftOrderEvent[]>((resolve) => {
		const events: SwiftOrderEvent[] = [];
		observable.subscribe({
			next: (event) => events.push(event),
			complete: () => resolve(events),
			error: () => resolve(events),
		});
	});
}

function sendAndConfirm(deadlineMs: number) {
	return SwiftClient.sendAndConfirmSwiftOrder(
		0,
		MarketType.PERP,
		'00',
		Buffer.alloc(64, 1),
		PublicKey.default,
		0,
		PublicKey.default,
		deadlineMs
	);
}

describe('SwiftClient.confirmSwiftOrder', function () {
	this.timeout(10_000);

	before(() => SwiftClient.init(BASE_URL));
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('confirms with the order id the server returns', async () => {
		const urls = stubFetch([{ status: 200, body: '42' }]);

		const response = await SwiftClient.confirmSwiftOrder(HASH, 5_000);

		expect(response.body).to.deep.equal({ status: 'confirmed', orderId: '42' });
		expect(urls[0]).to.equal(
			`${BASE_URL}/confirmation/hash-status?hash=${encodeURIComponent(HASH)}`
		);
	});

	it('reads a 422 as a failed placement with the body as the reason', async () => {
		stubFetch([{ status: 422, body: 'InsufficientCollateral' }]);

		const response = await SwiftClient.confirmSwiftOrder(HASH, 5_000);

		expect(response.success).to.equal(false);
		expect(response.status).to.equal(422);
		expect(response.body).to.deep.equal({
			status: 'failed',
			reason: 'InsufficientCollateral',
		});
	});

	it('keeps polling through a 5xx and a network error', async () => {
		const urls = stubFetch([
			{ status: 500, body: 'error finding' },
			'network-error',
			{ status: 200, body: '7' },
		]);

		const response = await SwiftClient.confirmSwiftOrder(HASH, 8_000);

		expect(response.body).to.deep.equal({ status: 'confirmed', orderId: '7' });
		expect(urls).to.have.length(3);
	});

	it('expires at the deadline when the order stays unknown', async () => {
		stubFetch([{ status: 404, body: 'not found' }]);
		const startMs = Date.now();

		const response = await SwiftClient.confirmSwiftOrder(HASH, 60_000, {
			deadlineMs: startMs + 300,
		});

		expect(response.body).to.deep.equal({ status: 'expired' });
		expect(Date.now() - startMs).to.be.lessThan(1_000);
	});

	it('expires at the deadline when a request never answers', async () => {
		stubFetch(['hang']);
		const startMs = Date.now();

		const response = await SwiftClient.confirmSwiftOrder(HASH, 0, {
			deadlineMs: startMs + 300,
		});

		expect(response.body).to.deep.equal({ status: 'expired' });
		expect(Date.now() - startMs).to.be.lessThan(1_000);
	});
});

describe('SwiftClient.sendAndConfirmSwiftOrder', function () {
	this.timeout(10_000);

	before(() => SwiftClient.init(BASE_URL));
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('emits sent then confirmed', async () => {
		stubFetch([{ status: 200, body: '9' }]);

		const events = await collectEvents(sendAndConfirm(Date.now() + 5_000));

		expect(events.map((event) => event.type)).to.deep.equal([
			'sent',
			'confirmed',
		]);
		expect(events[1]).to.include({ orderId: '9' });
	});

	it('emits errored with the reason on a 422', async () => {
		stubFetch([
			{ status: 404, body: 'not found' },
			{ status: 422, body: 'InsufficientCollateral' },
		]);

		const events = await collectEvents(sendAndConfirm(Date.now() + 5_000));

		expect(events.map((event) => event.type)).to.deep.equal([
			'sent',
			'errored',
		]);
		expect(events[1]).to.include({
			message: 'InsufficientCollateral',
			status: 422,
		});
	});

	it('emits expired by the deadline when the server keeps failing', async () => {
		stubFetch([{ status: 503, body: 'unavailable' }]);
		const startMs = Date.now();

		const events = await collectEvents(sendAndConfirm(startMs + 300));

		expect(events.map((event) => event.type)).to.deep.equal([
			'sent',
			'expired',
		]);
		expect(Date.now() - startMs).to.be.lessThan(1_000);
	});

	it('emits expired when the order post never answers', async () => {
		stubFetch([{ status: 200, body: '1' }], 'hang');
		const startMs = Date.now();

		const events = await collectEvents(sendAndConfirm(startMs + 100));

		expect(events.map((event) => event.type)).to.deep.equal(['expired']);
		expect(Date.now() - startMs).to.be.lessThan(3_000);
	});
});

describe('SwiftClient.sendAndConfirmSwiftOrderWS', function () {
	this.timeout(10_000);

	before(() => SwiftClient.init(BASE_URL));
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const connectionWithNoEntry = () => {
		const removed: number[] = [];
		const connection = {
			getAccountInfo: async () => null,
			onAccountChange: () => 1,
			removeAccountChangeListener: async (id: number) => {
				removed.push(id);
			},
		} as unknown as Connection;
		return { connection, removed };
	};

	const sendAndConfirmWS = (connection: Connection, deadlineMs: number) =>
		SwiftClient.sendAndConfirmSwiftOrderWS(
			connection,
			{} as VelocityClient,
			0,
			MarketType.PERP,
			'00',
			Buffer.alloc(64, 1),
			PublicKey.default,
			PublicKey.default,
			new Uint8Array(8),
			0,
			PublicKey.default,
			deadlineMs
		);

	it('ends early with the reason when the server reports a failed placement', async () => {
		stubFetch([{ status: 422, body: 'InsufficientCollateral' }]);
		const { connection, removed } = connectionWithNoEntry();
		const startMs = Date.now();

		const events = await collectEvents(
			sendAndConfirmWS(connection, startMs + 5_000)
		);

		expect(events.map((event) => event.type)).to.deep.equal([
			'sent',
			'errored',
		]);
		expect(events[1]).to.include({ message: 'InsufficientCollateral' });
		expect(Date.now() - startMs).to.be.lessThan(1_000);
		expect(removed).to.deep.equal([1]);
	});

	it('expires at the deadline when neither the chain nor the server answers', async () => {
		stubFetch([{ status: 500, body: 'error finding' }]);
		const { connection } = connectionWithNoEntry();
		const startMs = Date.now();

		const events = await collectEvents(
			sendAndConfirmWS(connection, startMs + 300)
		);

		expect(events.map((event) => event.type)).to.deep.equal([
			'sent',
			'expired',
		]);
		expect(Date.now() - startMs).to.be.lessThan(1_500);
	});
});

describe('swift confirmation deadline', () => {
	it('puts the placement deadline the placement window after prep', () => {
		expect(
			getSwiftPlacementDeadlineMs(1_000, 75, 400 as SlotDurationMs)
		).to.equal(31_000);
	});

	it('scales only the round trip margin by the multiplier', () => {
		expect(getSwiftConfirmationDeadlineMs(31_000, 1.5)).to.equal(
			31_000 + SWIFT_CONFIRMATION_ROUND_TRIP_MS * 1.5
		);
		expect(getSwiftConfirmationDeadlineMs(31_000, undefined)).to.equal(
			31_000 + SWIFT_CONFIRMATION_ROUND_TRIP_MS
		);
	});
});

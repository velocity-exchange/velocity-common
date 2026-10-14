import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';
import {
	BN,
	CancelSidesV0,
	PositionDirection,
	UserClobOrder,
} from '@velocity-exchange/sdk';
import { CentralServerVelocity } from '../../src/velocity/Velocity/clients/CentralServerVelocity';

const SUB_ACCOUNT_ID = 2;

const clobOrder = (overrides: Partial<UserClobOrder>): UserClobOrder => ({
	orderId: 7,
	nodeIndex: 3,
	clobOrderId: new BN(900),
	marketIndex: 0,
	direction: PositionDirection.LONG,
	price: new BN(100),
	baseAssetAmount: new BN(1),
	maxTs: new BN(0),
	activationSlot: new BN(0),
	placedSlot: new BN(0),
	takerOrigin: false,
	reduceOnly: false,
	venue: 'clob',
	...overrides,
});

/** A CentralServerVelocity whose client records every instruction it is asked for. */
const recordingServer = () => {
	const calls: string[] = [];
	const user = {
		getUserAccountOrThrow: () => ({ subAccountId: SUB_ACCOUNT_ID }),
	};
	const velocityClient = {
		getCancelOrdersByIdsIx: async (ids: number[]) => `slot:${ids.join(',')}`,
		getCancelOrdersIx: async () => 'slot:all',
		getCancelOrderV1Ix: async (
			params: { marketIndex: number; orderRef: { nodeIndex: number } },
			subAccountId: number,
			takerOrigin: boolean
		) =>
			`book:${params.marketIndex}:${params.orderRef.nodeIndex}:${subAccountId}:${takerOrigin}`,
		getCancelOrdersV1Ix: async (params: {
			marketIndex: number;
			sides: unknown;
		}) => {
			expect(params.sides).to.equal(CancelSidesV0.BOTH);
			return `sweep:${params.marketIndex}`;
		},
		buildTransaction: async (ixs: string[]) => {
			calls.push(...ixs);
			return 'tx';
		},
	};

	const server = Object.create(CentralServerVelocity.prototype);
	server._velocityClient = velocityClient;
	server.velocityClientContextWrapper = async (
		_key: PublicKey,
		operation: (user: unknown) => Promise<unknown>
	) => operation(user);

	return { server: server as CentralServerVelocity, calls };
};

describe('CentralServerVelocity CLOB cancels', () => {
	const account = PublicKey.default;

	it('cancels slot ids together and each book id by its ref', async () => {
		const { server, calls } = recordingServer();

		await server.getCancelOrdersTxn(account, [1, 7, 2], [clobOrder({})]);

		expect(calls).to.deep.equal([
			'slot:1,2',
			`book:0:3:${SUB_ACCOUNT_ID}:false`,
		]);
	});

	it('emits no slot cancel when every id rests on the book', async () => {
		const { server, calls } = recordingServer();

		await server.getCancelOrdersTxn(account, [7], [clobOrder({})]);

		expect(calls).to.deep.equal([`book:0:3:${SUB_ACCOUNT_ID}:false`]);
	});

	it('sweeps each book market once and cancels taker remainders by ref', async () => {
		const { server, calls } = recordingServer();

		await server.getCancelAllOrdersTxn(
			account,
			undefined,
			undefined,
			undefined,
			[
				clobOrder({}),
				clobOrder({ orderId: 8, marketIndex: 1, nodeIndex: 4 }),
				clobOrder({ orderId: 10, marketIndex: 1, nodeIndex: 6 }),
				clobOrder({
					orderId: 9,
					marketIndex: 1,
					nodeIndex: 5,
					takerOrigin: true,
				}),
			]
		);

		expect(calls).to.deep.equal([
			'slot:all',
			'sweep:0',
			'sweep:1',
			`book:1:5:${SUB_ACCOUNT_ID}:true`,
		]);
	});

	it('limits cancel-all to the market and cancels by ref for one direction', async () => {
		const { server, calls } = recordingServer();

		await server.getCancelAllOrdersTxn(
			account,
			undefined,
			1,
			PositionDirection.SHORT,
			[
				clobOrder({}),
				clobOrder({
					orderId: 8,
					marketIndex: 1,
					nodeIndex: 4,
					direction: PositionDirection.SHORT,
				}),
				clobOrder({ orderId: 11, marketIndex: 1, nodeIndex: 7 }),
			]
		);

		expect(calls).to.deep.equal([
			'slot:all',
			`book:1:4:${SUB_ACCOUNT_ID}:false`,
		]);
	});
});

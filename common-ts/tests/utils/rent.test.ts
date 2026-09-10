import { expect } from 'chai';
import { Connection } from '@solana/web3.js';
import { BigNum, LAMPORTS_EXP } from '@velocity-exchange/sdk';
import {
	NEW_ACCOUNT_BASE_RENT,
	NEW_ACCOUNT_DONATION,
	SWIFT_ACCOUNT_BASE_RENT,
} from '../../src/constants/misc';
import {
	SWIFT_ACCOUNT_SIZE,
	USER_ACCOUNT_SIZE,
	fetchAccountCreationRent,
	signedMsgUserOrdersSpace,
} from '../../src/utils/rent';

describe('rent', () => {
	it('signedMsgUserOrdersSpace matches SignedMsgUserOrders::space', () => {
		expect(signedMsgUserOrdersSpace(8)).to.equal(268);
		expect(signedMsgUserOrdersSpace(16)).to.equal(460);
		expect(SWIFT_ACCOUNT_SIZE).to.equal(268);
		expect(USER_ACCOUNT_SIZE).to.equal(4496);
	});

	it('fetchAccountCreationRent requests the right sizes and sums donation', async () => {
		const requestedSizes: number[] = [];
		const connection = {
			getMinimumBalanceForRentExemption: async (dataSize: number) => {
				requestedSizes.push(dataSize);
				if (dataSize === USER_ACCOUNT_SIZE) return 28_500_000;
				if (dataSize === SWIFT_ACCOUNT_SIZE) return 2_500_000;
				throw new Error(`unexpected size ${dataSize}`);
			},
		} as unknown as Connection;

		const rent = await fetchAccountCreationRent(connection);

		expect(requestedSizes).to.deep.equal([
			USER_ACCOUNT_SIZE,
			SWIFT_ACCOUNT_SIZE,
		]);
		expect(rent.userAccountRent.eq(BigNum.from(28_500_000, LAMPORTS_EXP))).to.be
			.true;
		expect(rent.swiftAccountRent.eq(BigNum.from(2_500_000, LAMPORTS_EXP))).to.be
			.true;
		expect(
			rent.baseCost.eq(
				BigNum.from(28_500_000, LAMPORTS_EXP)
					.add(NEW_ACCOUNT_DONATION)
					.add(BigNum.from(2_500_000, LAMPORTS_EXP))
			)
		).to.be.true;
		expect(rent.isLive).to.be.true;
	});

	it('fetchAccountCreationRent requests the swift size for a custom numOrders', async () => {
		const requestedSizes: number[] = [];
		const swiftSize16 = signedMsgUserOrdersSpace(16);
		const connection = {
			getMinimumBalanceForRentExemption: async (dataSize: number) => {
				requestedSizes.push(dataSize);
				if (dataSize === USER_ACCOUNT_SIZE) return 28_500_000;
				if (dataSize === swiftSize16) return 4_000_000;
				throw new Error(`unexpected size ${dataSize}`);
			},
		} as unknown as Connection;

		const rent = await fetchAccountCreationRent(connection, 16);

		expect(requestedSizes).to.deep.equal([USER_ACCOUNT_SIZE, swiftSize16]);
		expect(rent.swiftAccountRent.eq(BigNum.from(4_000_000, LAMPORTS_EXP))).to.be
			.true;
		expect(rent.isLive).to.be.true;
	});

	it('fetchAccountCreationRent falls back to NEW_ACCOUNT_BASE_* when the RPC call fails', async () => {
		const connection = {
			getMinimumBalanceForRentExemption: async () => {
				throw new Error('RPC down');
			},
		} as unknown as Connection;

		const rent = await fetchAccountCreationRent(connection);

		expect(rent.isLive).to.be.false;
		expect(rent.userAccountRent.eq(NEW_ACCOUNT_BASE_RENT)).to.be.true;
		expect(rent.swiftAccountRent.eq(SWIFT_ACCOUNT_BASE_RENT)).to.be.true;
		expect(
			rent.baseCost.eq(
				NEW_ACCOUNT_BASE_RENT.add(NEW_ACCOUNT_DONATION).add(
					SWIFT_ACCOUNT_BASE_RENT
				)
			)
		).to.be.true;
	});
});

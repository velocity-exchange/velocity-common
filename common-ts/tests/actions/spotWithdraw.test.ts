import {
	BN,
	BigNum,
	SpotBalanceType,
	SpotMarketAccount,
	SpotMarketConfig,
	User,
	VelocityClient,
} from '@velocity-exchange/sdk';
import { PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import { createWithdrawIx } from '../../src/drift/base/actions/spot/withdraw';

// USDT-like market: 6 decimals, with 1.2x accrued deposit interest so that the
// interest-adjusted token amount differs from the raw scaledBalance.
const DECIMALS = 6;
const CUMULATIVE_DEPOSIT_INTEREST = new BN(12_000_000_000);
const SCALED_BALANCE = new BN(40_728_445_000);
// getTokenAmount(SCALED_BALANCE, market, DEPOSIT) === 48.874134 tokens
const DEPOSIT_TOKEN_AMOUNT = new BN(48_874_134);

const spotMarketConfig = {
	marketIndex: 0,
	precisionExp: new BN(DECIMALS),
} as unknown as SpotMarketConfig;

const spotMarketAccount = {
	marketIndex: 0,
	decimals: DECIMALS,
	mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
	tokenProgramFlag: 0,
	cumulativeDepositInterest: CUMULATIVE_DEPOSIT_INTEREST,
} as unknown as SpotMarketAccount;

const makeUser = (
	spotPositions: { marketIndex: number; scaledBalance: BN; balanceType: any }[]
) =>
	({
		getUserAccountOrThrow: () => ({
			authority: PublicKey.default,
			subAccountId: 0,
			spotPositions,
		}),
	}) as unknown as User;

const depositUser = makeUser([
	{
		marketIndex: 0,
		scaledBalance: SCALED_BALANCE,
		balanceType: SpotBalanceType.DEPOSIT,
	},
]);

/**
 * Runs createWithdrawIx against stubbed client/user and returns the raw amount
 * handed to getWithdrawalIxs.
 */
const getSentAmount = async (params: {
	user: User;
	amount: BN;
	isMax?: boolean;
	isBorrow?: boolean;
}): Promise<BN> => {
	let sentAmount: BN | undefined;

	const velocityClient = {
		getSpotMarketAccountOrThrow: () => spotMarketAccount,
		getWithdrawalIxs: async (amount: BN) => {
			sentAmount = amount;
			return [];
		},
	} as unknown as VelocityClient;

	await createWithdrawIx({
		velocityClient,
		user: params.user,
		amount: BigNum.from(params.amount, spotMarketConfig.precisionExp),
		spotMarketConfig,
		isMax: params.isMax,
		isBorrow: params.isBorrow,
	});

	expect(sentAmount).to.exist;
	return sentAmount as BN;
};

describe('createWithdrawIx (max withdraw amount)', () => {
	it('passes a margin-bound max through unscaled', async () => {
		// Caller-computed max below the deposit balance: the on-chain reduceOnly clamp
		// must never get the chance to bind, so the amount has to survive untouched.
		const amount = new BN(12_222_156);

		const sentAmount = await getSentAmount({
			user: depositUser,
			amount,
			isMax: true,
		});

		expect(sentAmount.toString()).to.equal(amount.toString());
	});

	it('over-sends 2x the interest-adjusted token amount when the max closes out the deposit', async () => {
		const sentAmount = await getSentAmount({
			user: depositUser,
			amount: DEPOSIT_TOKEN_AMOUNT,
			isMax: true,
		});

		expect(sentAmount.toString()).to.equal(
			DEPOSIT_TOKEN_AMOUNT.muln(2).toString()
		);
		// not 2x the raw scaledBalance, which would be 1000x too large at 6 decimals
		expect(sentAmount.toString()).to.not.equal(
			SCALED_BALANCE.muln(2).toString()
		);
	});

	it('over-sends the deposit balance when the amount is zero', async () => {
		const sentAmount = await getSentAmount({
			user: depositUser,
			amount: new BN(0),
			isMax: true,
		});

		expect(sentAmount.toString()).to.equal(
			DEPOSIT_TOKEN_AMOUNT.muln(2).toString()
		);
	});

	it('passes through when the position is a borrow', async () => {
		const amount = new BN(1_000_000);
		const borrowUser = makeUser([
			{
				marketIndex: 0,
				scaledBalance: SCALED_BALANCE,
				balanceType: SpotBalanceType.BORROW,
			},
		]);

		const sentAmount = await getSentAmount({
			user: borrowUser,
			amount,
			isMax: true,
		});

		expect(sentAmount.toString()).to.equal(amount.toString());
	});

	it('passes through when there is no position for the market', async () => {
		const amount = new BN(1_000_000);

		const sentAmount = await getSentAmount({
			user: makeUser([]),
			amount,
			isMax: true,
		});

		expect(sentAmount.toString()).to.equal(amount.toString());
	});

	it('passes through a borrow withdraw without scaling', async () => {
		const amount = new BN(1_000_000);

		const sentAmount = await getSentAmount({
			user: depositUser,
			amount,
			isMax: true,
			isBorrow: true,
		});

		expect(sentAmount.toString()).to.equal(amount.toString());
	});
});

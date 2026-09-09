import { Connection } from '@solana/web3.js';
import { BigNum, LAMPORTS_EXP } from '@velocity-exchange/sdk';
import { NEW_ACCOUNT_DONATION } from '../constants/misc';

/**
 * Velocity User account data length (`User::SIZE` in
 * `programs/velocity/src/state/user.rs`). Passed to
 * `getMinimumBalanceForRentExemption` (RPC adds the 128-byte overhead).
 */
export const USER_ACCOUNT_SIZE = 4496;

/**
 * Data length for a SignedMsgUserOrders account with `numOrders` slots.
 * Mirrors `SignedMsgUserOrders::space` in
 * `programs/velocity/src/state/signed_msg_user.rs`.
 */
export function signedMsgUserOrdersSpace(numOrders: number): number {
	return 8 + 32 + 4 + 32 + numOrders * 24;
}

/** Default swift account size used at account creation (8 orders). */
export const SWIFT_ACCOUNT_SIZE = signedMsgUserOrdersSpace(8);

export type AccountCreationRent = {
	userAccountRent: BigNum;
	swiftAccountRent: BigNum;
	baseCost: BigNum;
};

/**
 * Live rent-exempt minimums for creating a user + default swift account.
 * Prefer this over the hardcoded `NEW_ACCOUNT_BASE_*` fallbacks — rent gates
 * (SIMD-0437) change `lamports_per_byte_year` over time.
 */
export async function fetchAccountCreationRent(
	connection: Connection
): Promise<AccountCreationRent> {
	const [userLamports, swiftLamports] = await Promise.all([
		connection.getMinimumBalanceForRentExemption(USER_ACCOUNT_SIZE),
		connection.getMinimumBalanceForRentExemption(SWIFT_ACCOUNT_SIZE),
	]);

	const userAccountRent = BigNum.from(userLamports, LAMPORTS_EXP);
	const swiftAccountRent = BigNum.from(swiftLamports, LAMPORTS_EXP);

	return {
		userAccountRent,
		swiftAccountRent,
		baseCost: userAccountRent.add(NEW_ACCOUNT_DONATION).add(swiftAccountRent),
	};
}

import { Connection } from '@solana/web3.js';
import { BigNum, LAMPORTS_EXP } from '@velocity-exchange/sdk';
import {
	NEW_ACCOUNT_BASE_RENT,
	NEW_ACCOUNT_DONATION,
	SWIFT_ACCOUNT_BASE_RENT,
} from '../constants/misc';

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
	/** False when the RPC call failed and the result is the hardcoded fallback. */
	isLive: boolean;
};

/**
 * Live rent-exempt minimums for creating a user + swift account with
 * `numOrders` order slots (default 8). Prefer this over the hardcoded
 * `NEW_ACCOUNT_BASE_*` fallbacks — rent gates (SIMD-0437) change
 * `lamports_per_byte_year` over time. Falls back to those constants
 * (`isLive: false`) if the RPC call fails, so callers get one code path.
 */
export async function fetchAccountCreationRent(
	connection: Connection,
	numOrders = 8
): Promise<AccountCreationRent> {
	try {
		const [userLamports, swiftLamports] = await Promise.all([
			connection.getMinimumBalanceForRentExemption(USER_ACCOUNT_SIZE),
			connection.getMinimumBalanceForRentExemption(
				signedMsgUserOrdersSpace(numOrders)
			),
		]);

		const userAccountRent = BigNum.from(userLamports, LAMPORTS_EXP);
		const swiftAccountRent = BigNum.from(swiftLamports, LAMPORTS_EXP);

		return {
			userAccountRent,
			swiftAccountRent,
			baseCost: userAccountRent.add(NEW_ACCOUNT_DONATION).add(swiftAccountRent),
			isLive: true,
		};
	} catch {
		return {
			userAccountRent: NEW_ACCOUNT_BASE_RENT,
			swiftAccountRent: SWIFT_ACCOUNT_BASE_RENT,
			baseCost: NEW_ACCOUNT_BASE_RENT.add(NEW_ACCOUNT_DONATION).add(
				SWIFT_ACCOUNT_BASE_RENT
			),
			isLive: false,
		};
	}
}

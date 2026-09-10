import { BigNum, LAMPORTS_EXP } from '@velocity-exchange/sdk';

/**
 * Equal to 0.0001
 */
export const NEW_ACCOUNT_DONATION = BigNum.fromPrint('0.0001', LAMPORTS_EXP);

/**
 * @deprecated Fallback for SSR / before RPC-derived rent is loaded.
 *
 * Rent-exempt minimum for a `User::SIZE` (4496-byte) account:
 * `(128 + 4496) * 3480 * 2`. Assumes a historical rent schedule (e.g.
 * pre-SIMD-0437 gate 1). Prefer deriving the live minimum via
 * `fetchAccountCreationRent`.
 */
export const NEW_ACCOUNT_BASE_RENT = new BigNum('32183040', LAMPORTS_EXP);

/**
 * @deprecated Fallback for SSR / before RPC-derived rent is loaded.
 * Prefer `fetchAccountCreationRent`.
 */
export const SWIFT_ACCOUNT_BASE_RENT = new BigNum('2756160', LAMPORTS_EXP);

/**
 * @deprecated Fallback for SSR / before RPC-derived rent is loaded.
 * Prefer `fetchAccountCreationRent`.
 */
export const NEW_ACCOUNT_BASE_COST = NEW_ACCOUNT_BASE_RENT.add(
	NEW_ACCOUNT_DONATION
).add(SWIFT_ACCOUNT_BASE_RENT);

/**
 * Equal to 0.002
 */
export const IF_STAKE_ACCOUNT_BASE_RENT = BigNum.fromPrint(
	'0.002',
	LAMPORTS_EXP
);

/**
 * Equal to 0.015 SOL
 */
export const MIN_LEFTOVER_SOL = BigNum.fromPrint('0.015', LAMPORTS_EXP);

export const ONE_DAY_MS = 1000 * 60 * 60 * 24;

import {
	ACCOUNT_AGE_DELETION_CUTOFF_SECONDS,
	BN,
	VelocityClient,
	IDLE_TIME,
	millisFromSlots,
	SlotDurationMs,
	User,
	UserStats,
	UserStatsAccount,
	ZERO,
	isVariant,
	positionIsAvailable,
} from '@velocity-exchange/sdk';
import { TransactionInstruction } from '@solana/web3.js';

type AccountDeletionStep =
	| 'askToCloseAllPositionsOrdersBorrows'
	| 'sendAccountDeletionIx'
	| 'sendBalanceWithdrawalIx'
	| 'sendTriggerAccountIdleIx'
	| 'askToWait';

const getStatsAccountDeletionWaitTime = (
	userStatsAccount: UserStatsAccount
) => {
	const estimatedAgeSeconds =
		Math.round(Date.now() / 1000) -
		UserStats.getOldestActionTs(userStatsAccount);

	return Math.max(ACCOUNT_AGE_DELETION_CUTOFF_SECONDS - estimatedAgeSeconds, 0);
};

const getStatsAccountIsPastDeletionCutoff = (
	userStatsAccount: UserStatsAccount
) => {
	const estimatedAgeSeconds =
		Math.round(Date.now() / 1000) -
		UserStats.getOldestActionTs(userStatsAccount);

	return estimatedAgeSeconds >= ACCOUNT_AGE_DELETION_CUTOFF_SECONDS;
};

const accountHasOpenPerpPositions = (user: User) => {
	const userAccount = user.getUserAccountOrThrow();
	for (const perpPosition of userAccount.perpPositions) {
		if (!positionIsAvailable(perpPosition)) {
			return true;
		}
	}

	return false;
};

const accountHasOpenSpotPositions = (user: User) => {
	const userAccount = user.getUserAccountOrThrow();
	for (const spotPosition of userAccount.spotPositions) {
		if (spotPosition.scaledBalance.gt(ZERO)) {
			return true;
		}
	}

	return false;
};

const accountHasOpenOrders = (user: User) => {
	const userAccount = user.getUserAccountOrThrow();
	return userAccount.orders.some((order) => isVariant(order.status, 'open'));
};

const accountHasOpenPositionsOrOrders = (user: User) => {
	if (accountHasOpenPerpPositions(user)) {
		return true;
	}

	if (accountHasOpenSpotPositions(user)) {
		return true;
	}

	if (accountHasOpenOrders(user)) {
		return true;
	}

	return false;
};

type CanBeDeletedState =
	| 'no'
	| 'yes'
	| 'no-wait-for-idle'
	| 'yes-after-making-idle';

const getAccountCanBeDeletedInstantly = (
	user: User,
	userStatsAccount: UserStatsAccount,
	currentSlot: number,
	slotDuration: SlotDurationMs
): CanBeDeletedState => {
	const statsAccountIsPastDeletionCutoff =
		getStatsAccountIsPastDeletionCutoff(userStatsAccount);

	const userIsIdle = user.getUserAccountOrThrow().idle;

	const userCanBeMarkedIdle = user.canMakeIdle(
		new BN(currentSlot),
		slotDuration
	);

	const accountHasOpenPerpSpotOrOrders = accountHasOpenPositionsOrOrders(user);

	if (accountHasOpenPerpSpotOrOrders) {
		return 'no';
	}

	if (statsAccountIsPastDeletionCutoff || userIsIdle) {
		return 'yes';
	}

	if (!userCanBeMarkedIdle) {
		return 'no-wait-for-idle';
	}

	return 'yes-after-making-idle';
};

/**
 * To try improve the UX we want to abstract away the different account states and deletion compliance. This method returns the steps required to give the best UX for account deletion depending on the incoming account state. A short explanation of the logic:
 *
 * States that affect whether an account can be deleted:
 * - A user stats account that is older than 13 days => All accounts can be deleted
 * - A user account that is idle => The user account in question can be deleted
 * - A user account that can be marked idle => The user account in question can be deleted after sending a markIdle instruction
 * - A user that is not/can not be idle (yet), with no stats account older than 13 days => wait until the account is idle and then try again. If the user has open perp positions, orders or borrows, they need to be closed first as well.
 * @param userAccount
 * @param userStatsAccount
 */
const getAccountDeletionStepsToTake = (
	user: User,
	userStatsAccount: UserStatsAccount,
	currentSlot: number,
	slotDuration: SlotDurationMs
): AccountDeletionStep[] => {
	const userAccount = user.getUserAccountOrThrow();
	const statsAccountIsPastDeletionCutoff =
		getStatsAccountIsPastDeletionCutoff(userStatsAccount);

	// Account is past deletion cutoff
	if (statsAccountIsPastDeletionCutoff) {
		return ['sendAccountDeletionIx'];
	}

	// Account needs to be unwound first
	const hasOpenPositionsOrOrders = accountHasOpenPositionsOrOrders(user);

	if (hasOpenPositionsOrOrders) {
		return ['askToCloseAllPositionsOrdersBorrows'];
	}

	// Account is idle and can be deleted
	const userAccountIsIdle = userAccount.idle;

	if (userAccountIsIdle) {
		return ['sendAccountDeletionIx'];
	}

	// Account can be marked idle and then deleted
	const canBeMarkedIdle = user.canMakeIdle(new BN(currentSlot), slotDuration);

	if (canBeMarkedIdle) {
		return ['sendTriggerAccountIdleIx', 'sendAccountDeletionIx'];
	}

	// Account is not idle and can not be marked idle yet, wait until it is (or can be marked) idle and then try again
	return ['askToWait'];
};

/**
 * Builds the necessary transaction to delete a user account. This method will throw an error if the account cannot be deleted instantly.
 * @param velocityClient
 * @param user
 * @param userStatsAccount
 * @param latestSlot
 * @returns
 */
const tryDeleteUserAccount = async (
	velocityClient: VelocityClient,
	user: User,
	userStatsAccount: UserStatsAccount,
	latestSlot: number,
	slotDuration: SlotDurationMs
) => {
	const canBeDeleted = getAccountCanBeDeletedInstantly(
		user,
		userStatsAccount,
		latestSlot,
		slotDuration
	);

	if (canBeDeleted === 'no' || canBeDeleted === 'no-wait-for-idle') {
		throw new Error('Account cannot be deleted');
	}

	const Ixs: TransactionInstruction[] = [];

	if (canBeDeleted === 'yes-after-making-idle') {
		// Create the make idle instruction
		Ixs.push(
			await velocityClient.getUpdateUserIdleIx(
				user.userAccountPublicKey,
				user.getUserAccountOrThrow()
			)
		);
	}

	// Create the delete account instruction
	Ixs.push(await velocityClient.getUserDeletionIx(user.userAccountPublicKey));

	// Create a transaction from the instructions
	const tx = await velocityClient.buildTransaction(Ixs);

	const { txSig } = await velocityClient.sendTransaction(tx);

	const userMapKey = velocityClient.getUserMapKey(
		user.getUserAccountOrThrow().subAccountId,
		velocityClient.wallet.publicKey
	);
	await velocityClient.users.get(userMapKey)?.unsubscribe();
	velocityClient.users.delete(userMapKey);

	return txSig;
};

/**
 * The program gates idleness on wall-clock, so the elapsed slot delta is
 * converted at the live duration rather than assumed; the remaining time is
 * rounded up so the estimate never under-states the wait.
 */
export const getIdleWaitTimeMinutes = (
	user: User,
	currentSlot: number,
	slotDuration: SlotDurationMs
) => {
	const lastActiveSlot = user.getUserAccountOrThrow().lastActiveSlot;

	const inactiveSlots = Math.max(currentSlot - lastActiveSlot.toNumber(), 0);

	const remainingMs = Math.max(
		IDLE_TIME.sub(
			millisFromSlots(new BN(inactiveSlots), slotDuration)
		).toNumber(),
		0
	);

	return Math.ceil(remainingMs / 60_000);
};

export const ACCOUNT_DELETION_HELPERS = {
	accountHasOpenOrders,
	accountHasOpenPerpPositions,
	accountHasOpenSpotPositions,
	getAccountDeletionStepsToTake,
	getAccountCanBeDeletedInstantly,
	getStatsAccountIsPastDeletionCutoff,
	tryDeleteUserAccount,
	getIdleWaitTimeMinutes,
	getStatsAccountDeletionWaitTime,
};

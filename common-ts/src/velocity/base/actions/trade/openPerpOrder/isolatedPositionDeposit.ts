import {
	BN,
	VelocityClient,
	User,
	calculateMarginUSDCRequiredForTrade,
	OptionalOrderParams,
	PositionDirection,
	MarketType,
	OrderType,
	ZERO,
} from '@velocity-exchange/sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { convertLeverageToMarginRatio } from '../../../../../utils/trading/leverage';
import {
	AdditionalIsolatedPositionDeposit,
	IsolatedPositionDepositsOverride,
} from './types';
import { getPositionMarginMode } from '../../../details/user/positionMarginMode';

export const ISOLATED_POSITION_DEPOSIT_BUFFER_BPS = 15;

export interface IsolatedMarginShortfall {
	marketIndex: number;
	shortfall: BN;
}

/**
 * Computes the initial margin shortfall for all isolated perp positions.
 * Returns a map of marketIndex -> shortfall (in QUOTE_PRECISION).
 * Only includes positions that are under initial margin (shortfall > 0).
 */
export function getIsolatedMarginShortfalls(user: User): Map<number, BN> {
	const shortfalls = new Map<number, BN>();

	const marginCalc = user.getMarginCalculation('Initial');

	for (const [
		marketIndex,
		isolatedCalc,
	] of marginCalc.isolatedMarginCalculations) {
		const shortfall = isolatedCalc.marginShortage();
		if (shortfall.gt(ZERO)) {
			shortfalls.set(marketIndex, shortfall);
		}
	}

	return shortfalls;
}

/**
 * Computes the initial margin shortfall for a single isolated perp position.
 * Returns the shortfall in QUOTE_PRECISION, or ZERO if no shortfall.
 */
export function getIsolatedMarginShortfall(
	user: User,
	marketIndex: number
): BN {
	const marginCalc = user.getMarginCalculation('Initial');
	const isolatedCalc = marginCalc.isolatedMarginCalculations.get(marketIndex);

	if (!isolatedCalc) {
		return ZERO;
	}

	return isolatedCalc.marginShortage();
}

/**
 * Returns all isolated margin shortfalls as an array, excluding a specific market index.
 * Useful for getting shortfalls for "other" isolated positions.
 */
export function getOtherIsolatedMarginShortfalls(
	user: User,
	excludeMarketIndex?: number
): IsolatedMarginShortfall[] {
	const shortfalls = getIsolatedMarginShortfalls(user);
	const result: IsolatedMarginShortfall[] = [];

	for (const [marketIndex, shortfall] of shortfalls) {
		if (
			excludeMarketIndex !== undefined &&
			marketIndex === excludeMarketIndex
		) {
			continue;
		}
		result.push({ marketIndex, shortfall });
	}

	return result;
}

/**
 * Computes the total of all isolated margin shortfalls.
 */
export function getTotalIsolatedMarginShortfall(
	user: User,
	excludeMarketIndex?: number
): BN {
	const shortfalls = getOtherIsolatedMarginShortfalls(user, excludeMarketIndex);
	return shortfalls.reduce((acc, s) => acc.add(s.shortfall), ZERO);
}

export interface ComputeIsolatedPositionDepositParams {
	velocityClient: VelocityClient;
	user: User;
	marketIndex: number;
	baseAssetAmount: BN;
	/**
	 * Optional direction of the order.
	 * If provided, we will check if the order will increase the position.
	 * If the order will not increase the position, we will return 0.
	 */
	direction?: PositionDirection;
	/**
	 * Margin ratio to use for the position (e.g. 2000 for 5x leverage).
	 */
	marginRatio: number;
	/**
	 * Optional estimated entry price to use for the margin calculation.
	 */
	entryPrice?: BN;
	/**
	 * Optional buffer denominator for the isolated position deposit.
	 *
	 * Smaller numbers mean a bigger buffer.
	 *
	 * bufferDenominator ->  Buffer %
	 *
	 * 15 ->                6.67%
	 *
	 * 20 (default) ->       5.00%
	 *
	 * 50 ->                2.00%
	 *
	 * 100 ->               1.00%
	 *
	 * 180 ->               0.56%
	 *
	 * 200 ->               0.50%
	 */
	bufferDenominator?: number;
	/**
	 * If true, the current market's initial margin shortfall (if any)
	 * will be added to the deposit amount.
	 */
	includeExistingShortfall?: boolean;
	/**
	 * Pre-computed existing shortfall for the current market.
	 * When provided alongside includeExistingShortfall, avoids a redundant getMarginCalculation call.
	 */
	existingShortfall?: BN;
}

/**
 * Computes the isolated position deposit required for opening an isolated perp position.
 * Returns a BN in QUOTE_PRECISION (USDT).
 */
export function computeIsolatedPositionDepositForTrade({
	velocityClient,
	user,
	marketIndex,
	baseAssetAmount,
	direction,
	marginRatio,
	entryPrice,
	bufferDenominator,
	includeExistingShortfall,
	existingShortfall: precomputedShortfall,
}: ComputeIsolatedPositionDepositParams): BN | null {
	// Only require isolated deposit if the order will increase the position (when direction is provided)
	if (direction !== undefined) {
		const maybeOrderParams: OptionalOrderParams = {
			marketIndex,
			marketType: MarketType.PERP,
			orderType: OrderType.MARKET,
			direction,
			baseAssetAmount,
		};
		const subAccountId = user.getUserAccountOrThrow().subAccountId;
		const isIncreasing = velocityClient.isOrderIncreasingPosition(
			maybeOrderParams,
			subAccountId
		);
		if (!isIncreasing) {
			return null;
		}
	}

	const marginRequired = calculateMarginUSDCRequiredForTrade(
		velocityClient,
		marketIndex,
		baseAssetAmount,
		marginRatio,
		entryPrice
	);

	let depositAmount = marginRequired.add(
		marginRequired.div(
			new BN(bufferDenominator ?? ISOLATED_POSITION_DEPOSIT_BUFFER_BPS)
		)
	);

	// Add existing shortfall for this market if requested
	if (includeExistingShortfall) {
		const existingShortfall =
			precomputedShortfall ?? getIsolatedMarginShortfall(user, marketIndex);
		if (existingShortfall.gt(ZERO)) {
			// Add shortfall with a 5% buffer on top (same as new margin)
			const shortfallWithBuffer = existingShortfall.add(
				existingShortfall.div(
					new BN(bufferDenominator ?? ISOLATED_POSITION_DEPOSIT_BUFFER_BPS)
				)
			);
			depositAmount = depositAmount.add(shortfallWithBuffer);
		}
	}

	return depositAmount;
}

/**
 * Error thrown when underwater isolated positions are detected and
 * replenishUnderwaterPositions is not set to true.
 */
export class UnderwaterIsolatedPositionsError extends Error {
	constructor(public readonly shortfalls: IsolatedMarginShortfall[]) {
		super(
			`Underwater isolated positions detected for markets: ${shortfalls
				.map((s) => s.marketIndex)
				.join(', ')}. ` +
				`Set replenishUnderwaterPositions: true to auto-cover, or manually handle shortfalls.`
		);
		this.name = 'UnderwaterIsolatedPositionsError';
	}
}

/**
 * Calculates isolated position deposits for a trade.
 * Auto-computes the main deposit from positionMaxLeverage.
 * Also detects underwater positions on other markets and either throws or computes additional deposits.
 */
export function calculateIsolatedPositionDeposits(params: {
	velocityClient: VelocityClient;
	user: User;
	marketIndex: number;
	baseAssetAmount: BN;
	direction?: PositionDirection;
	positionMaxLeverage: number;
	replenishUnderwaterPositions?: boolean;
}): {
	mainDeposit: BN | undefined;
	additionalIsolatedPositionDeposits:
		| AdditionalIsolatedPositionDeposit[]
		| undefined;
} {
	// Compute all shortfalls once (single getMarginCalculation call)
	// to avoid duplicate expensive margin calculations
	const allShortfalls = getIsolatedMarginShortfalls(params.user);

	// Extract current market's shortfall from the pre-computed map
	const currentMarketShortfall = allShortfalls.get(params.marketIndex) ?? ZERO;

	let mainIsolatedPositionDeposit: BN | undefined;
	const marginRatio = convertLeverageToMarginRatio(params.positionMaxLeverage);

	if (marginRatio) {
		mainIsolatedPositionDeposit = computeIsolatedPositionDepositForTrade({
			velocityClient: params.velocityClient,
			user: params.user,
			marketIndex: params.marketIndex,
			baseAssetAmount: params.baseAssetAmount,
			direction: params.direction,
			marginRatio,
			bufferDenominator: ISOLATED_POSITION_DEPOSIT_BUFFER_BPS,
			includeExistingShortfall: true,
			// Use pre-computed shortfall to avoid a second getMarginCalculation call
			existingShortfall: currentMarketShortfall,
		});
	}

	// Check for underwater positions (excluding current market)
	const otherShortfalls: IsolatedMarginShortfall[] = Array.from(allShortfalls)
		.filter(([marketIndex]) => marketIndex !== params.marketIndex)
		.map(([marketIndex, shortfall]) => ({ marketIndex, shortfall }));

	if (otherShortfalls.length > 0 && !params.replenishUnderwaterPositions) {
		throw new UnderwaterIsolatedPositionsError(otherShortfalls);
	}

	let additionalIsolatedPositionDeposits:
		| AdditionalIsolatedPositionDeposit[]
		| undefined;

	if (otherShortfalls.length > 0 && params.replenishUnderwaterPositions) {
		additionalIsolatedPositionDeposits = otherShortfalls.map((shortfall) => {
			const shortfallWithBuffer = shortfall.shortfall.add(
				shortfall.shortfall.div(new BN(ISOLATED_POSITION_DEPOSIT_BUFFER_BPS))
			);
			return {
				marketIndex: shortfall.marketIndex,
				amount: shortfallWithBuffer,
			};
		});
	}

	return {
		mainDeposit: mainIsolatedPositionDeposit,
		additionalIsolatedPositionDeposits,
	};
}

/**
 * Resolves isolated position deposits based on margin mode.
 * Returns undefined for cross margin mode, otherwise computes deposits.
 *
 * If marginMode is not explicitly provided, derives it from the user's existing position.
 */
export function resolveIsolatedPositionDeposits(params: {
	velocityClient: VelocityClient;
	user: User;
	marketIndex: number;
	baseAssetAmount: BN;
	direction?: PositionDirection;
	positionMaxLeverage: number;
	marginMode?: 'isolated' | 'cross';
	replenishUnderwaterPositions?: boolean;
}): ReturnType<typeof calculateIsolatedPositionDeposits> | undefined {
	const isIsolated =
		(params.marginMode ??
			getPositionMarginMode(params.user, params.marketIndex)) === 'isolated';

	if (!isIsolated) return undefined;

	return calculateIsolatedPositionDeposits(params);
}

/**
 * Resolves isolated position deposits, using pre-computed overrides if provided.
 * When `isolatedPositionDepositsOverride` is provided, skips auto-compute and uses
 * the override values directly. Otherwise, delegates to `resolveIsolatedPositionDeposits()`.
 */
export function resolveIsolatedPositionDepositsWithOverride(
	override: IsolatedPositionDepositsOverride | undefined,
	computeParams: Parameters<typeof resolveIsolatedPositionDeposits>[0]
): ReturnType<typeof resolveIsolatedPositionDeposits> {
	if (override !== undefined) {
		return {
			mainDeposit: override.mainDeposit,
			additionalIsolatedPositionDeposits: override.additionalDeposits,
		};
	}
	return resolveIsolatedPositionDeposits(computeParams);
}

export async function getIsolatedPositionDepositIxIfNeeded(
	velocityClient: VelocityClient,
	user: User,
	marketIndex: number,
	isolatedPositionDeposit?: BN,
	signingAuthority?: PublicKey
): Promise<TransactionInstruction | undefined> {
	if (!isolatedPositionDeposit) {
		return undefined;
	}
	if (isolatedPositionDeposit.isZero()) {
		return undefined;
	}

	return velocityClient.getTransferIsolatedPerpPositionDepositIx(
		isolatedPositionDeposit,
		marketIndex,
		user.getUserAccountOrThrow().subAccountId,
		undefined, // noAmountBuffer
		signingAuthority
	);
}

// Fixture based on velocity-v1/packages/sdk/tests/dlob/helpers.ts
// (mockAMM, mockMarketStats, mockPerpMarketCommon, mockPerpMarkets), with the AMM's
// reserves/invariant/bracket adjusted — see the comments on `mockAMM` below — to
// exercise `getVammL2Generator` with a genuine two-sided book. Everything else is
// copied verbatim.
// Rationale for copying rather than importing: velocity-common and the SDK are
// separate npm packages; the SDK's test fixtures are not published, so they
// cannot be imported across the package boundary.
import {
	AMM,
	MarketStats,
	BN,
	PerpMarketAccount,
	MarketStatus,
	ContractType,
	OracleSource,
	BASE_PRECISION,
	PEG_PRECISION,
	ZERO,
	ContractTier,
	PublicKey,
} from '@velocity-exchange/sdk';

// The SDK's verbatim mockAMM (baseAssetReserve=1*BASE_PRECISION, sqrtK=1,
// pegMultiplier=1, minBaseAssetReserve=maxBaseAssetReserve=0) is fine for the DLOB
// matching tests it was written for, but breaks `getVammL2Generator`:
// - sqrtK=1 makes the constant-product invariant (sqrtK^2) negligible next to the
//   ~1e9-scale reserves, so every simulated swap prices at zero.
// - minBaseAssetReserve=maxBaseAssetReserve=0 gives the bid side no bracket to open
//   liquidity into (openBids ends up 0) and lets the ask-side walk consume the AMM
//   down to a base reserve of exactly zero, which divides by zero in the SDK's
//   calculateSwapOutput.
// BASE_RESERVE/QUOTE_RESERVE/SQRT_K below are chosen so sqrtK^2 exactly equals
// baseAssetReserve*quoteAssetReserve (a real constant-product invariant) and price
// ~= $100 (matching the oracle price the vAMM-tier test stubs), with a +/-10%
// min/max bracket so both sides of the book get populated without hitting the
// zero-reserve edge case.
const BASE_RESERVE = new BN(1_000_000).mul(BASE_PRECISION); // 1e15
const QUOTE_RESERVE = BASE_RESERVE.muln(100); // 1e17 => price ~$100 at pegMultiplier=PEG_PRECISION
const SQRT_K = new BN(10).pow(new BN(16)); // sqrtK^2 === BASE_RESERVE * QUOTE_RESERVE (1e32)

export const mockAMM: AMM = {
	baseAssetReserve: BASE_RESERVE,
	quoteAssetReserve: QUOTE_RESERVE,
	// zero-spread mock: bid/ask reserves mirror the base/quote reserves
	askBaseAssetReserve: BASE_RESERVE,
	askQuoteAssetReserve: QUOTE_RESERVE,
	bidBaseAssetReserve: BASE_RESERVE,
	bidQuoteAssetReserve: QUOTE_RESERVE,
	sqrtK: SQRT_K,
	pegMultiplier: PEG_PRECISION,
	maxSlippageRatio: 1_000_000,
	lastOracleReservePriceSpreadPct: new BN(0),
	lastSpreadUpdateSlot: new BN(0),
	longSpread: 0,
	shortSpread: 0,
	referencePriceOffset: 0,

	feePool: {
		scaledBalance: new BN(0),
		marketIndex: 0,
	},
	concentrationCoef: new BN(0),
	minBaseAssetReserve: BASE_RESERVE.muln(9).divn(10),
	maxBaseAssetReserve: BASE_RESERVE.muln(11).divn(10),
	terminalQuoteAssetReserve: new BN(0),
	baseAssetAmountWithAmm: new BN(0),
	totalFee: new BN(0),
	totalMmFee: new BN(0),
	totalFeeMinusDistributions: new BN(0),
	totalFeeWithdrawn: new BN(0),
	lastUpdateSlot: new BN(0),
	netRevenueSinceLastFunding: new BN(0),
	lastCumulativeFundingRateLong: new BN(0),
	lastCumulativeFundingRateShort: new BN(0),
	baseSpread: 0,
	maxSpread: 0,
	maxFillReserveFraction: 0,
	curveUpdateIntensity: 0,
	ammJitIntensity: 0,
	ammSpreadAdjustment: 0,
	ammInventorySpreadAdjustment: 0,
	referencePriceOffsetDeadbandPct: 0,
	fundingBiasSensitivity: 0,
};

// Per-market analytics/oracle/twap data that was moved off AMM onto its own
// MarketStats sub-struct. mockPerpMarkets clones this for each market.
export const mockMarketStats: MarketStats = {
	lastMarkPriceTwap: new BN(0),
	lastMarkPriceTwap5Min: new BN(0),
	lastMarkPriceTwapTs: new BN(0),
	lastBidPriceTwap: new BN(0),
	lastAskPriceTwap: new BN(0),
	markStd: new BN(0),
	oracleStd: new BN(0),
	lastOracleConfPct: new BN(0),
	volume24H: new BN(0),
	longIntensityVolume: new BN(0),
	shortIntensityVolume: new BN(0),
	lastTradeTs: new BN(0),
	last24HAvgFundingRate: new BN(0),
	fundingPeriod: new BN(0),
	minOrderSize: new BN(0),
	mmOraclePrice: new BN(0),
	mmOracleSlot: new BN(0),
	mmOracleSequenceId: new BN(0),
	lastOracleNormalisedPrice: new BN(0),
	lastReferencePriceOffset: 0,
	lastOracleValid: true,
	lastFundingOracleTwap: new BN(0),
	historicalOracleData: {
		lastOraclePrice: new BN(0),
		lastOracleConf: new BN(0),
		lastOracleDelay: new BN(0),
		lastOraclePriceTwap: new BN(0),
		lastOraclePriceTwap5Min: new BN(0),
		lastOraclePriceTwapTs: new BN(0),
	},
};

// Fields shared by every mock perp market: the AMM, its MarketStats, the
// fields migrated off AMM to the top-level PerpMarket, and the other required
// PerpMarketAccount members the dlob/amm tests don't individually tweak.
function mockPerpMarketCommon(): Omit<
	PerpMarketAccount,
	| 'marketIndex'
	| 'marginRatioInitial'
	| 'marginRatioMaintenance'
	| 'contractTier'
> {
	return {
		status: MarketStatus.INITIALIZED,
		lastFillPrice: new BN(0),
		name: [],
		contractType: ContractType.PERPETUAL,
		expiryTs: new BN(0),
		expiryPrice: new BN(0),
		pubkey: PublicKey.default,
		amm: mockAMM,
		marketStats: mockMarketStats,
		numberOfUsersWithBase: 0,
		numberOfUsers: 0,
		nextFillRecordId: new BN(0),
		nextFundingRateRecordId: new BN(0),
		pnlPool: {
			scaledBalance: new BN(0),
			marketIndex: 0,
		},
		protocolFeePool: {
			scaledBalance: new BN(0),
			marketIndex: 0,
		},
		feeLedger: {
			totalExchangeFee: new BN(0),
			totalLiquidationFee: new BN(0),
			pendingProtocolFee: new BN(0),
			pendingIfFee: new BN(0),
			ammProtocolFeesReceived: new BN(0),
			pendingAmmProvision: new BN(0),
		},
		liquidatorFee: 0,
		ifLiquidationFee: 0,
		protocolLiquidationFee: 0,
		feePoolBufferTarget: new BN(0),
		imfFactor: 0,
		unrealizedPnlImfFactor: 0,
		unrealizedPnlMaxImbalance: ZERO,
		unrealizedPnlInitialAssetWeight: 0,
		unrealizedPnlMaintenanceAssetWeight: 0,
		insuranceClaim: {
			revenueWithdrawSinceLastSettle: new BN(0),
			maxRevenueWithdrawPerPeriod: new BN(0),
			lastRevenueWithdrawTs: new BN(0),
			quoteSettledInsurance: new BN(0),
			quoteMaxInsurance: new BN(0),
		},
		quoteSpotMarketIndex: 0,
		feeAdjustment: 0,
		poolId: 0,
		pausedOperations: 0,
		hedgeConfig: {
			poolId: 0,
			status: 0,
			pausedOperations: 0,
			exchangeFeeExclusionScalar: 0,
			feeTransferScalar: 0,
		},
		marketConfig: 0,

		// Fields migrated off AMM to top-level PerpMarket
		oracle: PublicKey.default,
		oracleSource: OracleSource.PYTH_LAZER,
		oracleSlotDelayOverride: 0,
		oracleLowRiskSlotDelayOverride: 0,
		baseAssetAmountLong: new BN(0),
		baseAssetAmountShort: new BN(0),
		quoteAssetAmount: new BN(0),
		quoteEntryAmountLong: new BN(0),
		quoteEntryAmountShort: new BN(0),
		quoteBreakEvenAmountLong: new BN(0),
		quoteBreakEvenAmountShort: new BN(0),
		totalSocialLoss: new BN(0),
		maxOpenInterest: new BN(0),
		cumulativeFundingRateLong: new BN(0),
		cumulativeFundingRateShort: new BN(0),
		lastFundingRate: new BN(0),
		lastFundingRateLong: new BN(0),
		lastFundingRateShort: new BN(0),
		lastFundingRateTs: new BN(0),
		netUnsettledFundingPnl: new BN(0),
		fundingClampThreshold: 5,
		fundingRampSlope: 1000000,
		orderStepSize: new BN(1),
		orderTickSize: new BN(1),
	};
}

export const mockPerpMarkets: Array<PerpMarketAccount> = [
	{
		...mockPerpMarketCommon(),
		contractTier: ContractTier.A,
		marketIndex: 0,
		marginRatioInitial: 2000,
		marginRatioMaintenance: 1000,
	},
	{
		...mockPerpMarketCommon(),
		contractTier: ContractTier.A,
		marketIndex: 1,
		marginRatioInitial: 0,
		marginRatioMaintenance: 0,
	},
	{
		...mockPerpMarketCommon(),
		contractTier: ContractTier.A,
		marketIndex: 2,
		marginRatioInitial: 0,
		marginRatioMaintenance: 0,
	},
];

import {
	QUOTE_PRECISION_EXP,
	BN,
	BigNum,
	User,
	ZERO,
	FOUR,
	TWO,
	VelocityClient,
	calculateClaimablePnl,
} from '@velocity-exchange/sdk';
import { USDT_SPOT_MARKET_INDEX } from '../../../../constants';
import { MarketId, MarketKey } from '../../../../types';

export type AccountMarginInfo = {
	/** Net USD value of the account, including spot balances and unsettled P&L from perp positions. */
	netUsdValue: BigNum;
	/** Total unsettled P&L from perp positions. Includes position P&L and funding P&L. */
	totalUnsettledPnl: BigNum;
	/** Total unsettled funding P&L from perp positions. */
	totalUnsettledFundingPnL: BigNum;
	/** Total claimable P&L from the P&L pool for perp positions. */
	totalClaimablePnl: BigNum;
	/** Total initial margin in the account. Includes weighted values of spot balances and unsettled P&L from perp positions. */
	totalInitialMargin: BigNum;
	/** Total maintenance margin in the account. Includes weighted values of spot balances and unsettled P&L from perp positions. */
	totalMaintenanceMargin: BigNum;
	/** Free initial margin in the account, used to open new positions. */
	freeInitialMargin: BigNum;
	/** Free maintenance margin in the account, used to avoid liquidations. */
	freeMaintenanceMargin: BigNum;
	/** Current leverage multiplier of the account. */
	leverage: number;
	/** Initial margin required to open a new position. */
	initialReq: BigNum;
	/** Maintenance margin required to avoid liquidations. */
	maintenanceReq: BigNum;
	/** Margin ratio of the account. */
	marginRatioPct: number;
};

export const getAccountMarginInfo = (
	velocityClient: VelocityClient,
	user: User,
	getOraclePrice: (marketKey: MarketKey) => BN
): AccountMarginInfo => {
	const netUsdValue = user.getNetUsdValue();
	const totalUnsettledPnl = user.getUnrealizedPNL(true); // method from SDK is inappropriately named, totalUnsettledPnl is the right definition here
	const totalUnsettledFundingPnL = user.getUnrealizedFundingPNL();
	const totalInitialMargin = user.getTotalCollateral();
	const totalMaintenanceMargin = user.getTotalCollateral('Maintenance');
	const freeInitialMargin = user.getFreeCollateral();
	const freeMaintenanceMargin = user.getFreeCollateral('Maintenance');
	const initialReq = user.getInitialMarginRequirement();
	const maintenanceReq = user.getMaintenanceMarginRequirement();
	const userLeverage = user.getLeverage();

	let userMarginRatio = user.getMarginRatio();
	// weird to display massive fraction when really it just means that their position is zero
	if (userMarginRatio.eq(new BN(Number.MAX_SAFE_INTEGER)))
		userMarginRatio = ZERO;

	const usdtSpotMarketAccount = velocityClient.getSpotMarketAccountOrThrow(
		USDT_SPOT_MARKET_INDEX
	);
	const totalClaimablePnl = user
		.getActivePerpPositions()
		.reduce((acc, position) => {
			const perpMarket = velocityClient.getPerpMarketAccountOrThrow(
				position.marketIndex
			);
			const oraclePrice = getOraclePrice(
				MarketId.createPerpMarket(position.marketIndex).key
			);
			const positionClaimablePnl = calculateClaimablePnl(
				perpMarket,
				usdtSpotMarketAccount,
				position,
				{
					price: oraclePrice,
				}
			);
			return acc.add(positionClaimablePnl);
		}, ZERO);

	return {
		netUsdValue: BigNum.from(netUsdValue, QUOTE_PRECISION_EXP),
		totalUnsettledPnl: BigNum.from(totalUnsettledPnl, QUOTE_PRECISION_EXP),
		totalUnsettledFundingPnL: BigNum.from(
			totalUnsettledFundingPnL,
			QUOTE_PRECISION_EXP
		),
		totalClaimablePnl: BigNum.from(totalClaimablePnl, QUOTE_PRECISION_EXP),
		totalInitialMargin: BigNum.from(totalInitialMargin, QUOTE_PRECISION_EXP),
		totalMaintenanceMargin: BigNum.from(
			totalMaintenanceMargin,
			QUOTE_PRECISION_EXP
		),
		freeInitialMargin: BigNum.from(freeInitialMargin, QUOTE_PRECISION_EXP),
		freeMaintenanceMargin: BigNum.from(
			freeMaintenanceMargin,
			QUOTE_PRECISION_EXP
		),
		leverage: BigNum.from(userLeverage, FOUR).toNum(),
		maintenanceReq: BigNum.from(maintenanceReq, QUOTE_PRECISION_EXP),
		initialReq: BigNum.from(initialReq, QUOTE_PRECISION_EXP),
		marginRatioPct: BigNum.from(userMarginRatio, TWO).toNum(),
	};
};

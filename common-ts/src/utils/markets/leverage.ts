import {
	VelocityClient,
	MarketType,
	MARGIN_PRECISION,
	PerpMarketAccount,
	SpotMarketAccount,
	SPOT_MARKET_WEIGHT_PRECISION,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../enum';
import { logger } from '../logger';
import { DEFAULT_MAX_MARKET_LEVERAGE } from '../../constants/markets';
import { exactLeverageFromMarginRatio } from '../trading/exactLeverage';

const getMaxLeverageForMarketAccount = (
	marketType: MarketType,
	marketAccount: PerpMarketAccount | SpotMarketAccount
): {
	maxLeverage: number;
} => {
	const isPerp = ENUM_UTILS.match(marketType, MarketType.PERP);

	try {
		if (isPerp) {
			const perpMarketAccount = marketAccount as PerpMarketAccount;
			const marginPrecision = MARGIN_PRECISION.toNumber();

			const marginRatioInitial =
				perpMarketAccount?.marginRatioInitial ||
				marginPrecision / DEFAULT_MAX_MARKET_LEVERAGE;

			const legacyMaxLeverage = parseFloat(
				(1 / (marginRatioInitial / marginPrecision)).toFixed(2)
			);

			return {
				maxLeverage: exactLeverageFromMarginRatio(
					marginRatioInitial,
					2,
					legacyMaxLeverage
				),
			};
		} else {
			const spotMarketAccount = marketAccount as SpotMarketAccount;
			const weightPrecision = SPOT_MARKET_WEIGHT_PRECISION.toNumber();

			const initialLiabilityWeight = spotMarketAccount
				? spotMarketAccount.initialLiabilityWeight
				: 0;

			const legacyMaxLeverage = parseFloat(
				(1 / (initialLiabilityWeight / weightPrecision - 1)).toFixed(2)
			);

			// At or below full weight the position carries no liability premium
			// (or is invalid); keep today's output there rather than dividing by
			// zero.
			if (initialLiabilityWeight <= weightPrecision) {
				return { maxLeverage: legacyMaxLeverage };
			}

			return {
				maxLeverage: exactLeverageFromMarginRatio(
					initialLiabilityWeight - weightPrecision,
					2,
					legacyMaxLeverage
				),
			};
		}
	} catch (e) {
		logger.error(e);
		return {
			maxLeverage: 0,
		};
	}
};

const getMaxLeverageForMarket = (
	marketType: MarketType,
	marketIndex: number,
	velocityClient: VelocityClient
): {
	maxLeverage: number;
} => {
	const marketAccount = ENUM_UTILS.match(marketType, MarketType.PERP)
		? velocityClient.getPerpMarketAccountOrThrow(marketIndex)
		: velocityClient.getSpotMarketAccountOrThrow(marketIndex);

	return getMaxLeverageForMarketAccount(marketType, marketAccount);
};

export { getMaxLeverageForMarketAccount, getMaxLeverageForMarket };

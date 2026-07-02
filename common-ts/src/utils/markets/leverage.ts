import {
	VelocityClient,
	MarketType,
	PerpMarketAccount,
	SpotMarketAccount,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../enum';
import { logger } from '../logger';
import { DEFAULT_MAX_MARKET_LEVERAGE } from '../../constants/markets';

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

			const maxLeverage = parseFloat(
				(
					1 /
					((perpMarketAccount?.marginRatioInitial
						? perpMarketAccount.marginRatioInitial
						: 10000 / DEFAULT_MAX_MARKET_LEVERAGE) /
						10000)
				).toFixed(2)
			);

			return {
				maxLeverage,
			};
		} else {
			const spotMarketAccount = marketAccount as SpotMarketAccount;

			const liabilityWeight = spotMarketAccount
				? spotMarketAccount.initialLiabilityWeight / 10000
				: 0;

			return {
				maxLeverage: parseFloat((1 / (liabilityWeight - 1)).toFixed(2)),
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

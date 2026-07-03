import {
	VelocityEnv,
	MarketType,
	PerpMarketConfig,
	PerpMarkets,
	SpotMarketConfig,
	SpotMarkets,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../enum';

const getBaseAssetSymbol = (marketName: string, removePrefix = false) => {
	let baseAssetSymbol = marketName.replace('-PERP', '').replace('/USDT', '');

	if (removePrefix) {
		baseAssetSymbol = baseAssetSymbol.replace('1K', '').replace('1M', '');
	}

	return baseAssetSymbol;
};

function getMarketConfig(
	velocityEnv: VelocityEnv,
	marketType: typeof MarketType.PERP,
	marketIndex: number
): PerpMarketConfig;
function getMarketConfig(
	velocityEnv: VelocityEnv,
	marketType: typeof MarketType.SPOT,
	marketIndex: number
): SpotMarketConfig;
function getMarketConfig(
	velocityEnv: VelocityEnv,
	marketType: MarketType,
	marketIndex: number
): PerpMarketConfig | SpotMarketConfig {
	const isPerp = ENUM_UTILS.match(marketType, MarketType.PERP);

	if (isPerp) {
		return PerpMarkets[velocityEnv][marketIndex];
	} else {
		return SpotMarkets[velocityEnv][marketIndex];
	}
}

export { getBaseAssetSymbol, getMarketConfig };

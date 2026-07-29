import {
	SpotMarketConfig,
	VelocityEnv,
	initialize,
	PerpMarketConfig,
	configs,
} from '@velocity-exchange/sdk';

export const Config: {
	initialized: boolean;
	spotMarketsLookup: SpotMarketConfig[];
	perpMarketsLookup: PerpMarketConfig[];
	sdkConfig: ReturnType<typeof initialize>;
} = {
	initialized: false,
	spotMarketsLookup: [],
	perpMarketsLookup: [],
	sdkConfig: configs.devnet,
};

export const Initialize = (env: VelocityEnv) => {
	const SDKConfig = initialize({ env });

	// Sparse, indexed by marketIndex rather than densely packed.
	const spotMarkets: SpotMarketConfig[] = [];
	const markets: PerpMarketConfig[] = [];

	SDKConfig.SPOT_MARKETS.forEach((spotMarket) => {
		spotMarkets[spotMarket.marketIndex] = spotMarket;
	});

	SDKConfig.PERP_MARKETS.forEach((perpMarket) => {
		markets[perpMarket.marketIndex] = perpMarket;
	});

	Config.spotMarketsLookup = spotMarkets;
	Config.perpMarketsLookup = markets;

	Config.initialized = true;

	return SDKConfig;
};

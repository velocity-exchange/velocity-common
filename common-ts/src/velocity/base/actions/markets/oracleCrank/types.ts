import {
	VelocityClient,
	PerpMarketConfig,
	SpotMarketConfig,
} from '@velocity-exchange/sdk';

export type OracleCrankFetchResult = {
	success: boolean;
	data?: string;
};

export type OracleCrankDataFetcher = (
	source: 'pythLazer',
	feedIds: (number | string)[]
) => Promise<OracleCrankFetchResult>;

export type OracleMarketConfig = PerpMarketConfig | SpotMarketConfig;

export type GetOracleCrankIxsOptions = {
	marketConfigs: OracleMarketConfig[];
	velocityClient: VelocityClient;
	fetchCrankData: OracleCrankDataFetcher;
	maxPythLazerCranks?: number;
	precedingIxsCount?: number;
};

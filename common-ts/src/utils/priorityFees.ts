import { MAINNET_API_URLS } from '../velocity/constants/apiUrls';
import { MarketId } from 'src/types';

const FEE_ENDPOINT = `${MAINNET_API_URLS.DLOB}/batchPriorityFees`;

export const getPriorityFeeLevelFromPercentile = (percentile: number) => {
	if (percentile < 0 || percentile > 100) {
		throw new Error('Percentile must be between 0 and 100');
	}

	if (percentile === 0) {
		return 'min';
	}

	if (percentile <= 25) {
		return 'low';
	}
	if (percentile <= 50) {
		return 'medium';
	}
	if (percentile <= 75) {
		return 'high';
	}
	if (percentile <= 95) {
		return 'veryHigh';
	}

	return 'unsafeMax';
};

/**
 * Helius fee buckets are as follows:
 *
 * none: 0th percentile
 * low: 25th percentile
 * medium: 50th percentile
 * high: 75th percentile
 * veryHigh: 95th percentile
 * unsafeMax: 100th percentile
 * default: 50th percentile
 */
export const getHeliusPriorityFeeEstimate = async (
	marketIds: MarketId[],
	priorityFeeLevel:
		| 'min'
		| 'low'
		| 'medium'
		| 'high'
		| 'veryHigh'
		| 'unsafeMax' = 'high',
	endpoint = FEE_ENDPOINT
): Promise<number[]> => {
	try {
		if (!marketIds?.length) {
			return [];
		}

		const queryParamsMap = {
			marketType: marketIds.map((market) => market.marketTypeStr).join(','),
			marketIndex: marketIds.map((market) => market.marketIndex).join(','),
		};
		const queryParams = Object.entries(queryParamsMap)
			.filter(([_key, param]) => param !== undefined)
			.map(([key, param]) => {
				return `${key}=${param}`;
			});
		const queryParamsString = `${queryParams.join('&')}`;

		const response = await fetch(`${endpoint}?${queryParamsString}`, {
			headers: { 'Content-Type': 'application/json' },
		});

		if (!response.ok) {
			return [];
		}

		const result = (await response.json()) as {
			min: number;
			low: number;
			medium: number;
			high: number;
			veryHigh: number;
			unsafeMax: number;
		}[];

		const feeLevelValues = result.map((result) => result?.[priorityFeeLevel]);

		return feeLevelValues;
	} catch (e) {
		return [];
	}
};

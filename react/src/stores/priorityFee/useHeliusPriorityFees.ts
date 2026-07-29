import { useRef } from 'react';
import { useInterval } from 'react-use';

const getHeliusPriorityFeeEstimate = async (
	heliusRpcUrl: string,
	feeSubscriptionAddressStrings: string[],
	targetPercentile: number
) => {
	try {
		const response = await fetch(heliusRpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: '1',
				method: 'getPriorityFeeEstimate',
				params: [
					{
						accountKeys: feeSubscriptionAddressStrings,
						options: {
							includeAllPriorityFeeLevels: true,
						},
					},
				],
			}),
		});

		const result = (await response.json()) as {
			jsonrpc: string;
			result: {
				priorityFeeLevels: {
					min: number;
					low: number;
					medium: number;
					high: number;
					veryHigh: number;
					unsafeMax: number;
				};
			};
			id: string;
		};

		/**
		 * Helius fee buckets are as follows:
		 * 
		 * enum PriorityLevel {
			NONE, // 0th percentile
			LOW, // 25th percentile
			MEDIUM, // 50th percentile
			HIGH, // 75th percentile
			VERY_HIGH, // 95th percentile
			// labelled unsafe to prevent people using and draining their funds by accident
			UNSAFE_MAX, // 100th percentile 
			DEFAULT, // 50th percentile
		}
		 */

		const resultToUse: keyof (typeof result)['result']['priorityFeeLevels'] =
			targetPercentile > 75
				? 'veryHigh'
				: targetPercentile > 50
					? 'high'
					: targetPercentile > 25
						? 'medium'
						: 'low';

		return result?.result?.priorityFeeLevels?.[resultToUse];
	} catch (e) {
		return undefined;
	}
};

export const useHeliusPriorityFees = (
	enabled: boolean,
	pollingInterval: number,
	heliusRpcUrl: string,
	feeSubscriptionAddressStrings: string[],
	targetFeePercentile: number
) => {
	const pollMs = pollingInterval;

	const latestHeliusFeeResultRef = useRef<number>(0);

	const refreshHeliusPriorityFeeValue = async () => {
		if (!enabled) return;

		const heliusResult = await getHeliusPriorityFeeEstimate(
			heliusRpcUrl,
			feeSubscriptionAddressStrings,
			targetFeePercentile
		);

		if (!heliusResult) {
			latestHeliusFeeResultRef.current = 0;
		} else {
			latestHeliusFeeResultRef.current = heliusResult;
		}
	};

	useInterval(refreshHeliusPriorityFeeValue, pollMs);

	return latestHeliusFeeResultRef;
};

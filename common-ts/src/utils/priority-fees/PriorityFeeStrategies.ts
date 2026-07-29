import {
	PriorityFeeStrategy,
	SolanaPriorityFeeResponse,
} from '@velocity-exchange/sdk';

/**
 * Default strategy. Keeps a moving window of fee samples from the past x slots, and returns the target percentile fee from the samples.
 *
 * @param feeStrategyTargetPercentile
 * @param feeSubscriptionSlotLookback
 * @returns
 */
const movingWindowTargetPercentileStrategy = (
	feeStrategyTargetPercentile: number,
	feeSubscriptionSlotLookback: number
): PriorityFeeStrategy => {
	const RECENT_SAMPLES: number[][] = [];
	let LAST_SEEN_SLOT_IN_SAMPLES = 0;

	return {
		calculate(newSamples: SolanaPriorityFeeResponse[]) {
			if (!newSamples?.length) return 0;

			const filteredSamples = newSamples.filter(
				(sample) =>
					sample.slot > LAST_SEEN_SLOT_IN_SAMPLES &&
					sample.prioritizationFee > 0
			);

			RECENT_SAMPLES.unshift(filteredSamples.map((s) => s.prioritizationFee));
			RECENT_SAMPLES.splice(feeSubscriptionSlotLookback);

			const allRecentSamplesAscendingSorted = RECENT_SAMPLES.flat().sort(
				(a, b) => {
					return a - b;
				}
			);

			const targetPercentileIndex = Math.min(
				allRecentSamplesAscendingSorted.length - 1,
				Math.ceil(
					(allRecentSamplesAscendingSorted.length / 100) *
						feeStrategyTargetPercentile
				)
			);

			const shouldSplitWithBelow =
				feeStrategyTargetPercentile < 100 &&
				targetPercentileIndex >= allRecentSamplesAscendingSorted.length - 1; // If the number of samples being returned are sufficiently small then in practise the target percentile is just selecting the MAX priority fee every time. For some safety, average top two instead when we get this case.

			const pFee = shouldSplitWithBelow
				? (allRecentSamplesAscendingSorted[targetPercentileIndex] +
						allRecentSamplesAscendingSorted[targetPercentileIndex - 1]) /
					2
				: allRecentSamplesAscendingSorted[targetPercentileIndex];

			if (filteredSamples.length > 0) {
				LAST_SEEN_SLOT_IN_SAMPLES = Math.max(
					...filteredSamples.map((sample) => sample.slot)
				);
			}

			return pFee;
		},
	};
};

export const PriorityFeeStrategyFactory = {
	default: movingWindowTargetPercentileStrategy,
	movingWindowTargetPercentileStrategy: movingWindowTargetPercentileStrategy,
};

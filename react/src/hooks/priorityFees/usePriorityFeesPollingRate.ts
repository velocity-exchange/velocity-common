import { useCommonDriftStore, usePriorityFeeStore } from '../../stores';

export const usePriorityFeesPollingRate = () => {
	const pollingMultiplier = useCommonDriftStore((s) => s.pollingMultiplier);
	const basePollingRateMs = useCommonDriftStore((s) => s.env.basePollingRateMs);
	const priorityFeePollingMultiplier = useCommonDriftStore(
		(s) => s.env.priorityFeePollingMultiplier
	);
	const isPriorityFeeStoreReady = usePriorityFeeStore((s) => s.ready);

	const pollingFrequencyMs = isPriorityFeeStoreReady
		? basePollingRateMs *
			Math.max(pollingMultiplier, priorityFeePollingMultiplier)
		: 1000; // poll more frequently until priority fee store is ready

	return pollingFrequencyMs;
};

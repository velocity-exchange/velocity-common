import { EnvironmentConstants, RpcEndpoint } from '@drift/common';
import { useEffect, useMemo, useState } from 'react';
import { singletonHook } from 'react-singleton-hook';
import { getResponseTimes } from '@drift/common';
import { useCommonDriftStore } from '../stores';
import { useCurrentRpc } from './useCurrentRpc';

const average = (arr: number[]) => arr.reduce((p, c) => p + c, 0) / arr.length;

const REFRESH_RATE_SECONDS = 5;

const useRpcLatencies = (rpcOptions: RpcEndpoint[]) => {
	const isLocalHost = window.location.href.includes('localhost');

	const initialState = rpcOptions.reduce(
		(acc, rpc) => ({
			...acc,
			[rpc.value]: {
				avg: null,
				lastFiveLatencies: [],
			},
		}),
		{}
	);

	const [avgLatencies, setAvgLatencies] =
		useState<Record<string, { avg: number; lastFiveLatencies: number[] }>>(
			initialState
		);

	useEffect(() => {
		const getAndSetLatencies = async () => {
			const responseTimes = await getResponseTimes(rpcOptions);

			if (responseTimes) {
				const newLatencies: Record<string, any> = {};
				responseTimes.forEach((rpc) => {
					const lastFiveLatencies = !rpc.latency
						? []
						: avgLatencies?.[rpc.value]?.lastFiveLatencies
							? [
									rpc.latency,
									...(avgLatencies?.[rpc.value]?.lastFiveLatencies || []),
								].slice(0, 5)
							: [rpc.latency];
					const avg = Math.ceil(average(lastFiveLatencies));
					newLatencies[rpc.value] = { avg, lastFiveLatencies };
				});
				setAvgLatencies(newLatencies);
			}
		};

		getAndSetLatencies();

		const interval = setInterval(
			getAndSetLatencies,
			(isLocalHost ? 10 : REFRESH_RATE_SECONDS) * 1000
		);

		return () => clearInterval(interval);
	}, [rpcOptions]);

	return avgLatencies;
};

const useAllRpcLatencies_ = () => {
	const isMainnet = useCommonDriftStore(
		(s) => s.env.driftEnv === 'mainnet-beta'
	);

	const rpcOptions = isMainnet
		? EnvironmentConstants.rpcs.mainnet
		: EnvironmentConstants.rpcs.dev;

	const latencies = useRpcLatencies(rpcOptions);

	return latencies;
};

export const useAllRpcLatencies = singletonHook({}, useAllRpcLatencies_);

const useCurrentRpcLatency_ = () => {
	const [currentRpc] = useCurrentRpc();

	const currentRpcSpec = useMemo(() => {
		if (!currentRpc) return [];

		const rpcSpec: RpcEndpoint = {
			...currentRpc,
			allowAdditionalConnection: false,
		};

		return [rpcSpec];
	}, [currentRpc]);

	if (!currentRpcSpec || currentRpcSpec?.length === 0) {
		return {
			avg: -1,
			lastFiveLatencies: [],
		};
	}

	const latencies = useRpcLatencies(currentRpcSpec);

	return latencies[currentRpcSpec[0]?.value];
};

export const useCurrentRpcLatency = singletonHook(
	{ avg: -1, lastFiveLatencies: [] },
	useCurrentRpcLatency_
);

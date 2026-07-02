import { RpcEndpoint } from 'src/EnvironmentConstants';
import { logger } from './logger';

export const getResponseTimes = async (rpcOptions: RpcEndpoint[]) => {
	const responseTimes = await Promise.all(
		rpcOptions.map(async (rpc) => {
			const responseTime = await getResponseTime(rpc.value);
			return { value: rpc.value, latency: responseTime };
		})
	);

	return responseTimes.filter((result) => result.latency != null);
};

export const getRpcWithLowestPing = async (rpcEndpoints: RpcEndpoint[]) => {
	const results = await Promise.all(
		rpcEndpoints.map((endpoint) => getResponseTime(endpoint.value))
	);

	const validResults = results.filter(
		(responseTime): responseTime is number =>
			responseTime !== -1 && responseTime !== null
	);

	if (validResults.length <= 0) return undefined;

	const lowestResponseTime = Math.min(...validResults);

	const rpcIndex = results.indexOf(lowestResponseTime);

	return rpcEndpoints[rpcIndex];
};

export const getResponseTime = async (
	endpoint: string
): Promise<number | null> => {
	if (!endpoint) return null;

	const storage =
		typeof localStorage !== 'undefined'
			? localStorage
			: require('localstorage-memory');

	const accessToken = storage.getItem('auth-token');

	const startTime = Date.now();
	const result = await fetch(`${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: 'Bearer ' + accessToken,
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
	}).catch((err) => {
		logger.error('Error checking RPC response time ', err);
		return null;
	});

	if (!result) return -1;
	if (!result.ok) return -1;

	const endTime = Date.now();

	return endTime - startTime;
};

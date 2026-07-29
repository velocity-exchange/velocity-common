import { TransactionInstruction } from '@solana/web3.js';
import { GetOracleCrankIxsOptions } from './types';
import { getPythLazerUpdateIxs } from './pythLazerCrank';
import {
	MAX_PYTH_LAZER_CRANKS,
	DEFAULT_PRECEDING_IXS_COUNT,
} from './constants';

export const getOracleCrankIxs = async (
	options: GetOracleCrankIxsOptions
): Promise<TransactionInstruction[]> => {
	const {
		marketConfigs,
		velocityClient,
		fetchCrankData,
		maxPythLazerCranks = MAX_PYTH_LAZER_CRANKS,
		precedingIxsCount = DEFAULT_PRECEDING_IXS_COUNT,
	} = options;

	if (marketConfigs.length === 0) {
		return [];
	}

	const pythLazerIxs = await getPythLazerUpdateIxs(
		marketConfigs,
		velocityClient,
		fetchCrankData,
		maxPythLazerCranks,
		precedingIxsCount
	);

	return [...pythLazerIxs];
};

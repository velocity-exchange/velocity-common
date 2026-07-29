import { useEffect } from 'react';
import { useCommonDriftStore } from '../stores/useCommonDriftStore';
import { useCommonDriftActions } from './useCommonDriftActions';
import { useCurrentRpc } from './useCurrentRpc';
import { VelocityClientConfig } from '@velocity-exchange/sdk';

const useInitializeConnection = (
	enable: boolean,
	additionalDriftClientConfig: Partial<VelocityClientConfig> = {}
) => {
	const Env = useCommonDriftStore((s) => s.env);
	const actions = useCommonDriftActions();
	const [currentRpc] = useCurrentRpc();

	const initConnection = async () => {
		if (!enable) return;

		const rpcToUse = Env.rpcOverride
			? {
					label: 'RPC Override',
					value: Env.rpcOverride,
					allowAdditionalConnection: false,
				}
			: currentRpc;

		if (Env.isDev) {
			console.log(`using driftEnv ${Env.driftEnv}`);
			console.log(`using rpc ${currentRpc.value}`);
		}

		if (!rpcToUse) {
			return;
		}

		actions.updateConnection({
			newRpc: rpcToUse,
			newDriftEnv: Env.driftEnv,
			additionalDriftClientConfig,
			subscribeToAccounts: Env.subscribeToAccounts ?? true,
		});
	};

	useEffect(() => {
		initConnection();
	}, [currentRpc.value, Env.driftEnv, Env.rpcOverride]);
};

export default useInitializeConnection;

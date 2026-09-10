import {
	BASE_PRECISION_EXP,
	BigNum,
	calculateInitUserFee,
} from '@velocity-exchange/sdk';
import { useEffect, useState } from 'react';
import { singletonHook } from 'react-singleton-hook';
import { useCommonDriftStore } from '../stores';
import { useDriftClientIsReady } from './useDriftClientIsReady';
// TODO(account-creation-rent): bump `@drift/common` → `@velocity-exchange/common`
// (once published past 0.9.0) and use `fetchAccountCreationRent` instead of the
// hardcoded NEW_ACCOUNT_BASE_COST. Blocked: react/package.json pins `@drift/common`
// to the published npm package (currently 0.4.1), not workspace source, so the new
// helper isn't importable here until common-ts publishes.
import { NEW_ACCOUNT_BASE_COST } from '@drift/common';

const _useAccountCreationCost = () => {
	const driftClient = useCommonDriftStore((s) => s.driftClient.client);
	const driftClientIsReady = useDriftClientIsReady();
	const [loaded, setLoaded] = useState(false);
	const [cost, setCost] = useState(NEW_ACCOUNT_BASE_COST);

	useEffect(() => {
		if (driftClient && driftClientIsReady) {
			const stateAccount = driftClient.getStateAccount();
			const fee = calculateInitUserFee(stateAccount);

			const newCost = NEW_ACCOUNT_BASE_COST.add(
				BigNum.from(fee, BASE_PRECISION_EXP)
			);

			setCost(newCost);
			setLoaded(true);
		}
	}, [driftClient, driftClientIsReady]);

	return {
		accountCreationCost: cost,
		accountCreationCostLoaded: loaded,
	};
};

/**
 * Cost of subaccount creation. Includes both base rent, donation (if any), and account creation rent.
 */
export const useAccountCreationCost = singletonHook(
	{
		accountCreationCost: NEW_ACCOUNT_BASE_COST,
		accountCreationCostLoaded: false,
	},
	_useAccountCreationCost
);

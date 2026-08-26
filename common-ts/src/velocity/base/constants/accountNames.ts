import { DEFAULT_USER_NAME } from '@velocity-exchange/sdk';
import {
	JLP_POOL_ID,
	MAIN_POOL_ID,
	SACRED_POOL_ID,
	LST_POOL_ID,
	EXPONENT_POOL_ID,
} from '../../../constants/pools';

export const DEFAULT_ACCOUNT_NAMES_BY_POOL_ID: Record<number, string> = {
	[MAIN_POOL_ID]: DEFAULT_USER_NAME,
	[JLP_POOL_ID]: 'JLP Market - Isolated Pool',
	[EXPONENT_POOL_ID]: 'Exponent Market - Isolated Pool',
	[SACRED_POOL_ID]: 'ACRED Market - Isolated Pool',
	[LST_POOL_ID]: 'LST Market - Isolated Pool',
};

import { TxParams } from '@velocity-exchange/sdk';

export type WithTxnParams<T> = T & { txParams?: TxParams };

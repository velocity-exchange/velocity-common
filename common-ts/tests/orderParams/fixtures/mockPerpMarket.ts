// Fixture copied from velocity-v1/packages/sdk/tests/dlob/helpers.ts (mockPerpMarkets[0]).
// A valid perp market account with a two-sided vAMM, used to exercise getVammL2Generator.
import { PerpMarketAccount } from '@velocity-exchange/sdk';
import { mockPerpMarkets } from './rawMockPerpMarkets';

export const mockPerpMarket: PerpMarketAccount = mockPerpMarkets[0];

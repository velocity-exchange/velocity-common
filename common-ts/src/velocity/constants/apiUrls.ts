/**
 * API URL constants for Velocity protocol services
 *
 * These constants define the URLs used within the velocity directory for various Velocity services.
 */

import { EnvironmentConstants } from '../../EnvironmentConstants';

export const MAINNET_API_URLS = {
	/**
	 * Data API - Used for historical data, funding rates, candles, etc.
	 */
	DATA_API: EnvironmentConstants.dataServerUrl.mainnet,

	/**
	 * DLOB (Decentralized Limit Order Book) Server - Used for auction parameters, priority fees, etc.
	 */
	DLOB: EnvironmentConstants.dlobServerHttpUrl.mainnet,

	/**
	 * Swift Server - Used for signed message (gasless) orders
	 */
	SWIFT: EnvironmentConstants.swiftServerUrl.mainnet,
} as const;

/**
 * API endpoints for specific functionality
 */
export const API_ENDPOINTS = {
	FUNDING_RATES: '/fundingRates',
	BATCH_PRIORITY_FEES: '/batchPriorityFees',
	AUCTION_PARAMS: '/auctionParams',
} as const;

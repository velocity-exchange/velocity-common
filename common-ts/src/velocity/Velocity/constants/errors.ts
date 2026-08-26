import { OptionalOrderParams } from '@velocity-exchange/sdk';

/**
 * Error thrown when a method is called while the user is geo-blocked.
 */
export class GeoBlockError extends Error {
	constructor(methodName: string) {
		super(
			`Method '${methodName}' is not available due to geographical restrictions.`
		);
		this.name = 'GeoBlockError';
	}
}

/**
 * Error thrown when no top makers are found. The order params provided can still be used as a fallback.
 */
export class NoTopMakersError extends Error {
	orderParams: OptionalOrderParams;
	constructor(message: string, orderParams: OptionalOrderParams) {
		super(message);
		this.name = 'NoTopMakersError';
		this.orderParams = orderParams;
	}
}

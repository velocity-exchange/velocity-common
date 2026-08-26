import {
	VelocityClient,
	PerpMarketAccount,
	SpotMarketAccount,
} from '@velocity-exchange/sdk';

export class CentralServerVelocityMarkets {
	constructor(private readonly velocityClient: VelocityClient) {}

	async getPerpMarketAccount(
		marketIndex: number
	): Promise<PerpMarketAccount | undefined> {
		return this.velocityClient.getPerpMarketAccount(marketIndex);
	}

	async getSpotMarketAccount(
		marketIndex: number
	): Promise<SpotMarketAccount | undefined> {
		return this.velocityClient.getSpotMarketAccount(marketIndex);
	}
}

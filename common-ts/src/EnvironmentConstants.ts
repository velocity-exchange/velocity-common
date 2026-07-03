export interface RpcEndpoint {
	label: string;
	value: string;
	wsValue?: string;
	allowAdditionalConnection: boolean;
}

export const EnvironmentConstants = {
	rpcs: {
		dev: [
			{
				label: 'Helius',
				value: 'https://detailed-sharleen-fast-devnet.helius-rpc.com',
				wsValue: 'wss://detailed-sharleen-fast-devnet.helius-rpc.com',
				allowAdditionalConnection: true,
			},
			{
				label: 'RPC Pool',
				value: 'https://velocity-solanad-b50f.devnet.rpcpool.com',
				wsValue: 'wss://velocity-solanad-b50f.devnet.rpcpool.com/whirligig',
				allowAdditionalConnection: false,
			},
		] as RpcEndpoint[],
		mainnet: [
			{
				label: 'Triton RPC Pool 1',
				value: 'https://velocity-solanam-c448.mainnet.rpcpool.com',
				wsValue: 'wss://velocity-solanam-c448.mainnet.rpcpool.com/whirligig',
				allowAdditionalConnection: true,
			},
			{
				label: 'Helius 1',
				value: 'https://margo-swuxg2-fast-mainnet.helius-rpc.com/',
				wsValue: 'wss://margo-swuxg2-fast-mainnet.helius-rpc.com/',
				allowAdditionalConnection: true,
			},
		] as RpcEndpoint[],
	},
	dataServerUrl: {
		dev: 'https://data.master.velocity.exchange',
		staging: 'https://data.staging.velocity.exchange',
		mainnet: 'https://data.velocity.exchange',
	},
	dlobServerHttpUrl: {
		dev: 'https://dlob.master.velocity.exchange',
		staging: 'https://dlob.staging.velocity.exchange',
		mainnet: 'https://dlob.velocity.exchange',
	},
	dlobServerWsUrl: {
		dev: 'wss://dlob.master.velocity.exchange/ws',
		staging: 'wss://dlob.staging.velocity.exchange/ws',
		mainnet: 'wss://dlob.velocity.exchange/ws',
	},
	eventsServerUrl: {
		dev: 'wss://events.master.velocity.exchange/ws',
		mainnet: 'wss://events.velocity.exchange/ws',
	},
	swiftServerUrl: {
		dev: 'https://swift.master.velocity.exchange',
		mainnet: 'https://swift.velocity.exchange',
	},
};

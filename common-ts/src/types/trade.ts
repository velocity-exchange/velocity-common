import { OrderType } from '@velocity-exchange/sdk';

export type TradeOffsetPrice =
	| 'worst'
	| 'best'
	| 'oracle'
	| 'mark'
	| 'entry'
	| 'bestOffer';

export type UIOrderType =
	| 'market'
	| 'limit'
	| 'stopMarket'
	| 'stopLimit'
	| 'takeProfitMarket'
	| 'takeProfitLimit'
	| 'oracle'
	| 'oracleLimit'
	| 'scaledOrders';

export type UIOrderTypeValue = {
	label: string;
	value: UIOrderType;
	orderType: OrderType;
	description?: string;
};

export type UIOrderTypeLookup = {
	[key in UIOrderType]: UIOrderTypeValue;
};

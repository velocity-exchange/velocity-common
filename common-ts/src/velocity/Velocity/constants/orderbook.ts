import {
	DlobServerChannel,
	OrderbookGrouping,
} from '../../../utils/dlob-server/DlobServerWebsocketUtils';

export const DEFAULT_ORDERBOOK_GROUPING: OrderbookGrouping = 100;
export const DEFAULT_ORDERBOOK_CHANNEL: DlobServerChannel =
	'orderbook_indicative';

export const DEFAULT_ORDERBOOK_SUBSCRIPTION_CONFIG = {
	channel: DEFAULT_ORDERBOOK_CHANNEL,
	grouping: DEFAULT_ORDERBOOK_GROUPING,
};

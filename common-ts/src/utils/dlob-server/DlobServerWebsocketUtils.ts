import { MarketId } from '../../types/MarketId';
import { UIMarket } from '../../types/UIMarket';

export type OrderbookGrouping = 1 | 10 | 100 | 500 | 1000;

export type DlobServerChannel =
	| 'trades'
	| 'orderbook'
	| 'orderbook_indicative'
	| 'heartbeat';

type BaseSubscriptionOutputProps<T extends DlobServerChannel> = {
	type: 'subscribe';
	channel: T;
};

interface OrderbookSubscriptionOutputProps extends BaseSubscriptionOutputProps<
	'orderbook' | 'orderbook_indicative'
> {
	marketType: 'perp';
	market: string;
	grouping?: OrderbookGrouping;
}

interface TradeSubscriptionOutputProps extends BaseSubscriptionOutputProps<'trades'> {
	marketType: 'perp';
	market: string;
}

type WebsocketSubscriptionOutputProps =
	| TradeSubscriptionOutputProps
	| OrderbookSubscriptionOutputProps;

type BaseUnsubscriptionOutputProps<T extends DlobServerChannel> = {
	type: 'unsubscribe';
	channel: T;
};

interface OrderbookUnsubscriptionOutputProps extends BaseUnsubscriptionOutputProps<
	'orderbook' | 'orderbook_indicative'
> {
	marketType: 'perp';
	market: string;
	grouping?: OrderbookGrouping;
}

interface TradeUnsubscriptionOutputProps extends BaseUnsubscriptionOutputProps<'trades'> {
	marketType: 'perp';
	market: string;
}

type WebsocketUnsubscriptionOutputProps =
	| OrderbookUnsubscriptionOutputProps
	| TradeUnsubscriptionOutputProps;

type BaseSubscriptionProps<T extends DlobServerChannel> = {
	type: T;
};

type TargetMarketProps = { market: MarketId };

interface OrderbookSubscriptionProps
	extends
		BaseSubscriptionProps<'orderbook' | 'orderbook_indicative'>,
		TargetMarketProps {
	grouping?: OrderbookGrouping;
}

interface TradesSubscriptionProps
	extends BaseSubscriptionProps<'trades'>, TargetMarketProps {}

type WebsocketSubscriptionProps =
	| TradesSubscriptionProps
	| OrderbookSubscriptionProps;

export type WebsocketServerResponse = {
	channel: string;
	data: string;
	error?: any;
};

const getMarketSymbolFromId = (marketId: MarketId) => {
	const perpMarket = UIMarket.perpMarkets.find(
		(m) => marketId.marketIndex === m.marketIndex
	);
	return perpMarket?.symbol ?? '';
};

const assertPerpMarket = (market: MarketId) => {
	if (!market.isPerp) {
		throw new Error(
			`DlobServerWebsocketUtils only supports perp markets; got spot market index ${market.marketIndex}`
		);
	}
};

const getSubscriptionProps = (
	props: WebsocketSubscriptionProps
): WebsocketSubscriptionOutputProps => {
	assertPerpMarket(props.market);
	const type = props.type;

	switch (type) {
		case 'orderbook': {
			return {
				type: 'subscribe',
				channel: 'orderbook',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
				...(props.grouping && { grouping: props.grouping }),
			};
		}
		case 'orderbook_indicative': {
			return {
				type: 'subscribe',
				channel: 'orderbook_indicative',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
				...(props.grouping && { grouping: props.grouping }),
			};
		}
		case 'trades': {
			return {
				type: 'subscribe',
				channel: 'trades',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
			};
		}
		default: {
			const exhaustiveCheck: never = type;
			throw new Error(`Unhandled case: ${exhaustiveCheck}`);
		}
	}
};

const getUnsubscriptionProps = (
	props: WebsocketSubscriptionProps
): WebsocketUnsubscriptionOutputProps => {
	assertPerpMarket(props.market);
	const type = props.type;

	switch (type) {
		case 'orderbook': {
			return {
				type: 'unsubscribe',
				channel: 'orderbook',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
				...(props.grouping && { grouping: props.grouping }),
			};
		}
		case 'orderbook_indicative': {
			return {
				type: 'unsubscribe',
				channel: 'orderbook_indicative',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
				...(props.grouping && { grouping: props.grouping }),
			};
		}
		case 'trades': {
			return {
				type: 'unsubscribe',
				channel: 'trades',
				market: getMarketSymbolFromId(props.market),
				marketType: 'perp',
			};
		}
		default: {
			const exhaustiveCheck: never = type;
			throw new Error(`Unhandled case: ${exhaustiveCheck}`);
		}
	}
};

/**
 * This function needs to take the subscription probs and map it into matching channel key that is returned by the websocket for the subscription
 * @param props
 * @returns
 */
const getChannelKey = (props: WebsocketSubscriptionProps) => {
	const type = props.type;

	switch (type) {
		case 'orderbook': {
			return `orderbook_perp_${props.market.marketIndex}${
				props.grouping ? `_grouped_${props.grouping}` : ''
			}`;
		}
		case 'orderbook_indicative': {
			return `orderbook_perp_${props.market.marketIndex}${
				props.grouping ? `_grouped_${props.grouping}` : ''
			}_indicative`;
		}
		case 'trades': {
			return `trades_perp_${props.market.marketIndex}`;
		}
		default: {
			const exhaustiveCheck: never = type;
			throw new Error(`Unhandled case: ${exhaustiveCheck}`);
		}
	}
};

const getMessageFilter = (
	props: WebsocketSubscriptionProps
): ((message: { channel: string; data: any }) => boolean) => {
	const type = props.type;

	switch (type) {
		case 'orderbook':
		case 'orderbook_indicative': {
			return (message: { channel: string; data: any }) => {
				return (
					message.channel === getChannelKey(props) ||
					// This is a special extra message which comes through once, immediately after subscribing, to let the subscriber know the initial state of the orderbook
					message.channel ===
						`last_update_orderbook_perp_${props.market.marketIndex}`
				);
			};
		}
		case 'trades': {
			return (message: { channel: string; data: any }) =>
				message.channel === getChannelKey(props) ||
				message.channel === 'heartbeat';
		}
		default: {
			const exhaustiveCheck: never = type;
			throw new Error(`Unhandled case: ${exhaustiveCheck}`);
		}
	}
};

export const DLOB_SERVER_WEBSOCKET_UTILS = {
	getSubscriptionProps,
	getUnsubscriptionProps,
	getMessageFilter,
};

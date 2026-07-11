import {
	PostOnlyParams,
	MarketType,
	BN,
	OptionalOrderParams,
	BigNum,
	PRICE_PRECISION_EXP,
	getLimitOrderParams,
	oraclePriceBands as getOraclePriceBands,
	VelocityClient,
	User,
	PositionDirection,
} from '@velocity-exchange/sdk';
import { getPerpAuctionDuration } from '../../../../../utils/orders/flags';
import { getLimitAuctionParams } from '../../../../../utils/trading/auction';
import { DEFAULT_LIMIT_AUCTION_DURATION } from '../../../constants/auction';
import { ENUM_UTILS } from '../../../../../utils';
import invariant from 'tiny-invariant';
import { fetchAuctionOrderParams } from './dlobServer';
import { LimitOrderParamsOrderConfig, LimitAuctionConfig } from './types';
import { AuctionParamsFetchedCallback } from '../../../../utils/auctionParamsResponseMapper';

export const getLimitAuctionOrderParams = async ({
	velocityClient,
	user,
	marketIndex,
	marketType,
	direction,
	baseAssetAmount,
	userOrderId = 0,
	reduceOnly = false,
	postOnly = PostOnlyParams.NONE,
	orderConfig,
	onAuctionParamsFetched,
}: {
	velocityClient: VelocityClient;
	user: User;
	marketIndex: number;
	marketType: MarketType;
	direction: PositionDirection;
	baseAssetAmount: BN;
	positionMaxLeverage: number;
	userOrderId?: number;
	reduceOnly?: boolean;
	postOnly?: PostOnlyParams;
	orderConfig: LimitOrderParamsOrderConfig & {
		limitAuction: LimitAuctionConfig;
	};
	onAuctionParamsFetched?: AuctionParamsFetchedCallback;
}): Promise<OptionalOrderParams> => {
	const { orderParams } = await fetchAuctionOrderParams({
		velocityClient,
		user,
		assetType: 'base',
		marketIndex,
		marketType,
		direction,
		amount: baseAssetAmount,
		reduceOnly,
		dlobServerHttpUrl: orderConfig.limitAuction.dlobServerHttpUrl,
		optionalAuctionParamsInputs:
			orderConfig.limitAuction.optionalLimitAuctionParams,
		onAuctionParamsFetched: onAuctionParamsFetched,
	});

	const isPerp = ENUM_UTILS.match(marketType, MarketType.PERP);

	invariant(orderConfig.limitAuction.oraclePrice, 'Oracle price not found');
	invariant(orderParams.auctionStartPrice, 'Auction start price not found');

	let oraclePriceBands: [BN, BN] | undefined = undefined;
	let auctionDuration = DEFAULT_LIMIT_AUCTION_DURATION;

	if (isPerp) {
		const perpMarketAccount = velocityClient.getPerpMarketAccount(marketIndex);
		invariant(isPerp && perpMarketAccount, 'Perp market account not found');

		oraclePriceBands = orderConfig.limitAuction.oraclePrice
			? getOraclePriceBands(perpMarketAccount, {
					price: orderConfig.limitAuction.oraclePrice,
			  })
			: undefined;

		auctionDuration = getPerpAuctionDuration(
			orderConfig.limitPrice.sub(orderParams.auctionStartPrice).abs(),
			orderConfig.limitAuction.oraclePrice,
			perpMarketAccount.contractTier
		);
	}

	const limitAuctionParams = getLimitAuctionParams({
		direction,
		inputPrice: BigNum.from(orderConfig.limitPrice, PRICE_PRECISION_EXP),
		startPriceFromSettings: orderParams.auctionStartPrice,
		duration: auctionDuration,
		auctionStartPriceOffset: orderConfig.limitAuction.auctionStartPriceOffset,
		oraclePriceBands,
	});

	const limitAuctionOrderParams = getLimitOrderParams({
		marketIndex,
		marketType,
		direction,
		baseAssetAmount,
		reduceOnly,
		postOnly,
		price: orderConfig.limitPrice,
		userOrderId,
		...limitAuctionParams,
	});

	return limitAuctionOrderParams;
};

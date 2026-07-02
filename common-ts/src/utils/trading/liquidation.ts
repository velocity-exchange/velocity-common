import { BN, BigNum, PRICE_PRECISION_EXP, User } from '@velocity-exchange/sdk';
import { UIOrderType } from '../../types';
import { logger } from '../logger';

/**
 * Calculate the liquidation price of a position after a trade. Requires VelocityClient to be subscribed.
 * If the order type is limit order, a limit price must be provided.
 */
const calculateLiquidationPriceAfterPerpTrade = ({
	estEntryPrice,
	orderType,
	perpMarketIndex,
	tradeBaseSize,
	isLong,
	userClient,
	oraclePrice,
	limitPrice,
	offsetCollateral,
	precision = 2,
	capLiqPrice,
	marginType,
}: {
	estEntryPrice: BN;
	orderType: UIOrderType;
	perpMarketIndex: number;
	tradeBaseSize: BN;
	isLong: boolean;
	userClient: User;
	oraclePrice: BN;
	limitPrice?: BN;
	offsetCollateral?: BN;
	precision?: number;
	capLiqPrice?: boolean;
	marginType?: 'Cross' | 'Isolated';
}) => {
	const ALLOWED_ORDER_TYPES: UIOrderType[] = [
		'limit',
		'market',
		'oracle',
		'stopMarket',
		'stopLimit',
		'oracleLimit',
	];

	if (!ALLOWED_ORDER_TYPES.includes(orderType)) {
		logger.error(
			'Invalid order type for perp trade liquidation price calculation',
			orderType
		);
		return 0;
	}

	if (orderType === 'limit' && !limitPrice) {
		logger.error(
			'Limit order must have a limit price for perp trade liquidation price calculation'
		);
		return 0;
	}

	const signedBaseSize = isLong ? tradeBaseSize : tradeBaseSize.neg();
	const priceToUse = [
		'limit',
		'stopMarket',
		'stopLimit',
		'oracleLimit',
	].includes(orderType)
		? limitPrice
		: estEntryPrice;

	const liqPriceBn = userClient.liquidationPrice(
		perpMarketIndex,
		signedBaseSize,
		priceToUse,
		undefined,
		undefined, // we can exclude open orders since open orders will be cancelled first (which results in reducing account leverage) before actual liquidation
		offsetCollateral,
		marginType === 'Isolated' ? 'Isolated' : undefined
	);

	if (liqPriceBn.isNeg()) {
		// means no liquidation price
		return 0;
	}

	// Check if user has a spot position using the same oracle as the perp market
	// If so, force capLiqPrice to be false to avoid incorrect price capping
	// Technically in this case, liq price could be lower for a short or higher for a long
	const perpMarketOracle =
		userClient.velocityClient.getPerpMarketAccount(perpMarketIndex)?.oracle;

	const spotMarketWithSameOracle = perpMarketOracle
		? userClient.velocityClient
				.getSpotMarketAccounts()
				.find((market) => market.oracle.equals(perpMarketOracle))
		: undefined;

	let hasSpotPositionWithSameOracle = false;
	if (spotMarketWithSameOracle) {
		const spotPosition = userClient.getSpotPosition(
			spotMarketWithSameOracle.marketIndex
		);
		hasSpotPositionWithSameOracle = !!spotPosition;
	}

	const effectiveCapLiqPrice = hasSpotPositionWithSameOracle
		? false
		: capLiqPrice;

	const cappedLiqPriceBn = effectiveCapLiqPrice
		? isLong
			? BN.min(liqPriceBn, oraclePrice)
			: BN.max(liqPriceBn, oraclePrice)
		: liqPriceBn;

	const liqPriceBigNum = BigNum.from(cappedLiqPriceBn, PRICE_PRECISION_EXP);

	const liqPriceNum =
		Math.round(liqPriceBigNum.toNum() * 10 ** precision) / 10 ** precision;

	return liqPriceNum;
};

export { calculateLiquidationPriceAfterPerpTrade };

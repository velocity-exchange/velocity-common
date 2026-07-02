import {
	BN,
	OrderType,
	MarketType,
	PositionDirection,
	PostOnlyParams,
	OrderTriggerCondition,
} from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '../../utils';
import { logger } from '../../utils/logger';

export interface MappedAuctionParams {
	orderType: OrderType;
	marketType: MarketType;
	userOrderId?: number;
	direction: PositionDirection;
	baseAssetAmount: BN;
	marketIndex: number;
	reduceOnly?: boolean;
	postOnly?: PostOnlyParams;
	immediateOrCancel?: boolean;
	triggerPrice?: BN | null;
	triggerCondition?: OrderTriggerCondition;
	oraclePriceOffset?: BN | null;
	auctionDuration: number | undefined;
	maxTs?: BN | null;
	auctionStartPrice: BN | undefined;
	auctionEndPrice: BN | undefined;
}

// Field mapping configuration
type FieldType = 'enum' | 'bn' | 'number' | 'boolean' | 'bn_nullable';

interface FieldConfig {
	type: FieldType;
}

// Define the type for the actual params object
interface ServerAuctionParams {
	orderType?: string;
	marketType?: string;
	userOrderId?: number;
	direction?: string;
	baseAssetAmount?: string | number;
	marketIndex?: number;
	reduceOnly?: boolean;
	postOnly?: string;
	immediateOrCancel?: boolean;
	triggerPrice?: string | number | null;
	triggerCondition?: string;
	oraclePriceOffset?: string | number;
	auctionDuration?: number;
	maxTs?: string | number | null;
	auctionStartPrice?: string | number;
	auctionEndPrice?: string | number;
}

export interface ServerAuctionParamsResponse {
	data: {
		params: ServerAuctionParams;
		// Additional fields like entryPrice, bestPrice, etc. are ignored for now
	};
}

export type AuctionParamsFetchedCallback = (
	urlSearchParams: URLSearchParams,
	response: ServerAuctionParamsResponse
) => void;

const FIELD_MAPPING: Record<keyof ServerAuctionParams, FieldConfig> = {
	// Enums (string -> enum object)
	orderType: { type: 'enum' },
	marketType: { type: 'enum' },
	direction: { type: 'enum' },
	postOnly: { type: 'enum' },
	triggerCondition: { type: 'enum' },

	// Numbers (keep as numbers)
	userOrderId: { type: 'number' },
	marketIndex: { type: 'number' },
	auctionDuration: { type: 'number' },

	// Booleans
	reduceOnly: { type: 'boolean' },
	immediateOrCancel: { type: 'boolean' },

	// BNs (string/number -> BN)
	baseAssetAmount: { type: 'bn' },
	auctionStartPrice: { type: 'bn' },
	auctionEndPrice: { type: 'bn' },

	// Nullable BNs
	triggerPrice: { type: 'bn_nullable' },
	maxTs: { type: 'bn_nullable' },
	oraclePriceOffset: { type: 'bn_nullable' },
};

// Type conversion functions
const convertValue = (value: any, type: FieldType): any => {
	switch (type) {
		case 'enum':
			try {
				// Convert string values to proper SDK enums
				let enumResult;
				switch (value) {
					case 'oracle':
						enumResult = OrderType.ORACLE;
						break;
					case 'market':
						enumResult = OrderType.MARKET;
						break;
					case 'limit':
						enumResult = OrderType.LIMIT;
						break;
					case 'trigger_market':
						enumResult = OrderType.TRIGGER_MARKET;
						break;
					case 'trigger_limit':
						enumResult = OrderType.TRIGGER_LIMIT;
						break;
					case 'perp':
						enumResult = MarketType.PERP;
						break;
					case 'spot':
						enumResult = MarketType.SPOT;
						break;
					case 'long':
						enumResult = PositionDirection.LONG;
						break;
					case 'short':
						enumResult = PositionDirection.SHORT;
						break;
					case 'none':
						enumResult = PostOnlyParams.NONE;
						break;
					case 'must_post_only':
						enumResult = PostOnlyParams.MUST_POST_ONLY;
						break;
					case 'try_post_only':
						enumResult = PostOnlyParams.TRY_POST_ONLY;
						break;
					case 'above':
						enumResult = OrderTriggerCondition.ABOVE;
						break;
					case 'below':
						enumResult = OrderTriggerCondition.BELOW;
						break;
					case 'triggered_above':
						enumResult = OrderTriggerCondition.TRIGGERED_ABOVE;
						break;
					case 'triggered_below':
						enumResult = OrderTriggerCondition.TRIGGERED_BELOW;
						break;
					default:
						logger.warn(
							`⚠️  [Converter] Unknown enum value: ${value}, using ENUM_UTILS.toObj as fallback`
						);
						enumResult = ENUM_UTILS.toObj(value);
				}
				return enumResult;
			} catch (error) {
				logger.error(
					`❌ [Converter] Enum conversion failed for ${value}:`,
					error
				);
				throw error;
			}
		case 'bn':
			if (value === null || value === undefined) {
				// Server returned null for a required BN field, this should cause fallback to client-side calculation
				throw new Error(
					`Server returned ${
						value === null ? 'null' : 'undefined'
					} for required BN field, expected non-null value`
				);
			}
			return new BN(value.toString());
		case 'bn_nullable':
			return value === null || value === undefined
				? null
				: new BN(value.toString());
		case 'number':
			return value;
		case 'boolean':
			return value;
		default:
			return value;
	}
};

/**
 * Maps the server response from getOrderParams back to proper client-side types
 */
export function mapAuctionParamsResponse(
	serverAuctionParams: ServerAuctionParams
): MappedAuctionParams {
	const mapped: Partial<MappedAuctionParams> = {};

	// Extract the actual params from the nested structure
	if (!serverAuctionParams) {
		throw new Error('Invalid server response: missing data.params');
	}

	// Process each field based on its configuration
	Object.entries(FIELD_MAPPING).forEach(([fieldName, config]) => {
		const serverValue =
			serverAuctionParams[fieldName as keyof ServerAuctionParams];

		if (serverValue !== undefined) {
			try {
				(mapped as any)[fieldName] = convertValue(serverValue, config.type);
			} catch (error) {
				logger.error(`🔴 [Mapper] Field conversion error:`, {
					fieldName,
					serverValue,
					expectedType: config.type,
					actualType: typeof serverValue,
					isNull: serverValue === null,
					isUndefined: serverValue === undefined,
					fullServerResponse: serverAuctionParams,
				});
				throw new Error(
					`Failed to convert field '${fieldName}' (value: ${serverValue}, type: ${
						config.type
					}): ${error instanceof Error ? error.message : error}`
				);
			}
		}
	});

	return mapped as MappedAuctionParams;
}

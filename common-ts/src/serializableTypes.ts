import {
	BASE_PRECISION_EXP,
	BigNum,
	BN,
	CandleResolution,
	AmmCurveChanged,
	DepositExplanation,
	DepositRecord,
	Event,
	FundingPaymentRecord,
	FundingRateRecord,
	InsuranceFundRecord,
	InsuranceFundStakeRecord,
	isVariant,
	LiquidateBorrowForPerpPnlRecord,
	LiquidatePerpPnlForDepositRecord,
	LiquidatePerpRecord,
	LiquidateSpotRecord,
	LiquidationRecord,
	LiquidationType,
	MarketType,
	NewUserRecord,
	Order,
	OrderAction,
	OrderActionExplanation,
	OrderStatus,
	OrderTriggerCondition,
	OrderType,
	PERCENTAGE_PRECISION_EXP,
	PerpBankruptcyRecord,
	PositionDirection,
	PRICE_PRECISION_EXP,
	PublicKey,
	QUOTE_PRECISION_EXP,
	SettlePnlExplanation,
	SettlePnlRecord,
	SpotBalanceType,
	SpotBankruptcyRecord,
	SpotInterestRecord,
	StakeAction,
	SwapRecord,
	TEN,
	WrappedEvent,
	ZERO,
} from '@velocity-exchange/sdk';
import {
	autoserializeAs,
	autoserializeAsArray,
	autoserializeAsJson,
	autoserializeUsing,
	Deserialize,
	inheritSerialization,
	JsonObject,
	JsonType,
	Serialize,
	SetDeserializeKeyTransform,
	SetSerializeKeyTransform,
	SnakeCase,
} from 'cerializr';
import { assert } from './utils/assert';
import { logger } from './utils/logger';
import { Config } from './Config';
import {
	AccountSnapshot,
	LeaderboardResult,
	LeaderBoardResultRow,
	PnlHistoryDataPoint,
	PnlSnapshotOrderOption,
	RollingPnlData,
	SnapshotEpochResolution,
	UIAccountSnapshot,
	UserPerpPositionSnapshot,
	UserSnapshotRecord,
	UserSpotPositionSnapshot,
} from './types/leaderboard';

// Reusable transformers

const BNSerializationFn = (target: BN) =>
	target ? target.toString() : undefined;
const BNDeserializationFn = (val: JsonType) =>
	val ? new BN(val as string) : undefined;
const BNSerializeAndDeserializeFns = {
	Serialize: BNSerializationFn,
	Deserialize: BNDeserializationFn,
};

const QuoteBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;

const QuoteBigNumDeserializationFn = (val: JsonType) =>
	val != null
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), QUOTE_PRECISION_EXP)
			: BigNum.fromPrint(val.toString(), QUOTE_PRECISION_EXP)
		: undefined;

const QuoteBigNumSerializeAndDeserializeFns = {
	Serialize: QuoteBigNumSerializationFn,
	Deserialize: QuoteBigNumDeserializationFn,
};

const NullableQuoteBigNumSerializeAndDeserializeFns = {
	Serialize: (target: BigNum | BN | null) =>
		target === null ? null : QuoteBigNumSerializationFn(target),
	Deserialize: (val: JsonType) =>
		val === null ? null : QuoteBigNumDeserializationFn(val),
};

const MarketBasedBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;

const targetPrecisionBigNumDeserializationFn = (
	val: JsonType,
	precision: BN
) => {
	return val !== undefined &&
		(typeof val === 'string' || typeof val === 'number')
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), precision)
			: BigNum.fromPrint(val.toString(), precision)
		: undefined;
};

// Main purpose of defer deserialization is to defer the precision setting until onDeserialized
const DeferBigNumDeserializationFn = (val: JsonType) => {
	return val !== undefined
		? typeof val === 'string'
			? BigNum.from(0, ZERO)
			: BigNum.fromPrint('0', ZERO)
		: undefined;
};

const MarketBasedBigNumSerializeAndDeserializeFns = {
	Serialize: MarketBasedBigNumSerializationFn,
	Deserialize: DeferBigNumDeserializationFn,
};

const NullableMarketBasedBigNumSerializeAndDeserializeFns = {
	Serialize: (target: BigNum | BN | null) =>
		target === null ? null : MarketBasedBigNumSerializationFn(target),
	Deserialize: (val: JsonType) =>
		val === null ? null : DeferBigNumDeserializationFn(val),
};

const PctBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;

const PctBigNumDeserializationFn = (val: JsonType) =>
	val != null
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), PERCENTAGE_PRECISION_EXP)
			: BigNum.fromPrint(val.toString(), PERCENTAGE_PRECISION_EXP)
		: undefined;

const PctBigNumSerializeAndDeserializeFns = {
	Serialize: PctBigNumSerializationFn,
	Deserialize: PctBigNumDeserializationFn,
};

const BaseBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;
const BaseBigNumDeserializationFn = (val: JsonType) =>
	val != null
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), BASE_PRECISION_EXP)
			: BigNum.fromPrint(val.toString(), BASE_PRECISION_EXP)
		: undefined;
const BaseBigNumSerializeAndDeserializeFns = {
	Serialize: BaseBigNumSerializationFn,
	Deserialize: BaseBigNumDeserializationFn,
};

const PriceBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;
const PriceBigNumDeserializationFn = (val: JsonType) =>
	val != null
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), PRICE_PRECISION_EXP)
			: BigNum.fromPrint(val.toString(), PRICE_PRECISION_EXP)
		: undefined;
const PriceBigNumSerializeAndDeserializeFns = {
	Serialize: PriceBigNumSerializationFn,
	Deserialize: PriceBigNumDeserializationFn,
};

const NullablePriceBigNumSerializeAndDeserializeFns = {
	Serialize: (target: BigNum | BN | null) =>
		target === null ? null : PriceBigNumSerializationFn(target),
	Deserialize: (val: JsonType) =>
		val === null ? null : PriceBigNumDeserializationFn(val),
};

// Funding rate and bank cumulative interest serialize identically to price
// (same PRICE_PRECISION_EXP); alias rather than duplicate the functions.
const FundingRateBigNumSerializeAndDeserializeFns =
	PriceBigNumSerializeAndDeserializeFns;

const BankCumulativeInterestBigNumSerializeAndDeserializeFns =
	PriceBigNumSerializeAndDeserializeFns;

const ReferralVolumeBigNumSerializationFn = (target: BigNum | BN) =>
	target
		? target instanceof BigNum
			? target.print()
			: target.toString()
		: undefined;
const ReferralVolumeBigNumDeserializationFn = (val: JsonType) =>
	val != null
		? typeof val === 'string'
			? BigNum.from(val.replace('.', ''), TEN)
			: BigNum.fromPrint(val.toString(), TEN)
		: undefined;
const ReferralVolumeBigNumSerializeAndDeserializeFns = {
	Serialize: ReferralVolumeBigNumSerializationFn,
	Deserialize: ReferralVolumeBigNumDeserializationFn,
};

const PublicKeySerializationFn = (target: PublicKey) =>
	target ? target.toString() : null;
const PublicKeyDeserializationFn = (val: JsonType) =>
	val ? new PublicKey(val as string) : null;
const PublicKeySerializeAndDeserializeFns = {
	Serialize: PublicKeySerializationFn,
	Deserialize: PublicKeyDeserializationFn,
} as const;

const EnumSerializationFn = (target: Record<string, unknown>) => {
	if (!target) return null;

	return Object.keys(target)[0];
};
const EnumDeserializationFn = (val: any) => {
	if (!val) return null;

	{
		if (typeof val === 'string') return { [val]: {} };

		return val;
	}
};
const EnumSerializeAndDeserializeFns = {
	Serialize: EnumSerializationFn,
	Deserialize: EnumDeserializationFn,
};

const getPrecisionToUse = (marketType: MarketType, marketIndex: number) => {
	if (isVariant(marketType, 'spot')) {
		return Config.spotMarketsLookup[marketIndex].precisionExp;
	}
	return BASE_PRECISION_EXP;
};

/**
 * Handles correctly deserializing precision for spot records where we don't know the precision until the onDeserialized hook is called
 */
const handleOnDeserializedPrecision = <T>(
	data: JsonObject,
	instance: T,
	precision: BN,
	keysToUse: (keyof T)[]
) => {
	keysToUse.forEach((key) => {
		// @ts-ignore :: Don't know how to correctly type this because it doesn't know the key corresponds to a BigNum, but it should always be a BigNum
		instance[key] = targetPrecisionBigNumDeserializationFn(
			data[key],
			precision
		);
	});
};

/**
 * Generic utility function to validate event types during deserialization
 * @param instance The instance being deserialized
 * @param expectedEventType The expected event type
 * @param className The name of the class being deserialized (for error messages)
 */
function validateEventTypeOnDeserialize<
	InstanceType extends { eventType?: string }
>(
	instance: InstanceType,
	expectedEventType: InstanceType extends { eventType: infer EventType }
		? EventType
		: never,
	className: string
): void {
	if (instance.eventType !== expectedEventType) {
		// Check that eventType is not defined but incorrect because then something has gone bad
		assert(
			!instance.eventType,
			`eventType is truthy but not ${expectedEventType} when deserializing ${className}`
		);

		// If it's just undefined then we're happy to set it for them
		instance.eventType = expectedEventType as string;
	}
}

/**
 * Generic utility function to validate and set event types during serialization
 * @param json The JSON object being serialized
 * @param expectedEventType The expected event type
 * @param className The name of the class being serialized (for error messages)
 */
function validateEventTypeOnSerialize<
	InstanceType extends { eventType?: string }
>(
	json: JsonObject,
	expectedEventType: InstanceType extends { eventType: infer E } ? E : never,
	className: string
): void {
	if (json.eventType !== expectedEventType) {
		// Check that eventType is not defined but incorrect because then something has gone bad
		assert(
			!json.eventType,
			`eventType is truthy but not ${expectedEventType} when serializing ${className}`
		);

		// If it's just undefined then we're happy to set it for them
		json.eventType = expectedEventType as string;
	}
}

// Serializable classes
//// Order Records

export type OrderRecordEvent = WrappedEvent<'OrderRecord'>;

export class SerializableOrder implements Order {
	@autoserializeUsing(EnumSerializeAndDeserializeFns) status!: OrderStatus;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) orderType!: OrderType;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(Number) orderId!: number;
	@autoserializeAs(Number) userOrderId!: number;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) price: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmountFilled: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetAmountFilled: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	direction!: PositionDirection;
	@autoserializeAs(Boolean) reduceOnly!: boolean;
	@autoserializeUsing(BNSerializeAndDeserializeFns) triggerPrice: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	triggerCondition!: OrderTriggerCondition;
	@autoserializeAs(Boolean) postOnly!: boolean;
	@autoserializeAs(Boolean) immediateOrCancel!: boolean;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePriceOffset: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) auctionStartPrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) auctionEndPrice: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	existingPositionDirection!: OrderStatus;
	@autoserializeUsing(BNSerializeAndDeserializeFns) slot: BN;
	@autoserializeAs(Number) auctionDuration!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) marketType!: MarketType;
	@autoserializeUsing(BNSerializeAndDeserializeFns) maxTs: BN;
	@autoserializeAs(Number) bitFlags!: number;
	@autoserializeAs(Number) postedSlotTail!: number;
}

@inheritSerialization(SerializableOrder)
export class UISerializableOrder extends SerializableOrder {
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) price: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmount: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmountFilled: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteAssetAmountFilled: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	triggerPrice: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePriceOffset: BigNum;

	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	auctionStartPrice: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	auctionEndPrice: BigNum;

	static onDeserialized(data: JsonObject, instance: UISerializableOrder) {
		assert(Config.initialized, 'Common Config Not Initialised');
		if (isVariant(instance.marketType, 'spot')) {
			const precisionToUse =
				Config.spotMarketsLookup[instance.marketIndex].precisionExp;
			instance.baseAssetAmount.precision = precisionToUse;

			instance.baseAssetAmountFilled.precision = precisionToUse;
		}
	}
}

// @ts-ignore
export class SerializableOrderRecord implements OrderRecordEvent {
	@autoserializeAs(String) eventType!: 'OrderRecord';
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(SerializableOrder) order!: Order;

	static onDeserialized(data: JsonObject, instance: SerializableOrderRecord) {
		validateEventTypeOnDeserialize(
			instance,
			'OrderRecord',
			'SerializableOrderRecord'
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<SerializableOrderRecord>(
			json,
			'OrderRecord',
			'SerializableOrderRecord'
		);
	}
}

@inheritSerialization(SerializableOrderRecord)
export class UISerializableOrderRecord extends SerializableOrderRecord {
	//@ts-ignore
	@autoserializeAs(UISerializableOrder) order: UISerializableOrder;

	static onDeserialized(data: JsonObject, instance: UISerializableOrderRecord) {
		validateEventTypeOnDeserialize(
			instance,
			'OrderRecord',
			'UISerializableOrderRecord'
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<UISerializableOrderRecord>(
			json,
			'OrderRecord',
			'UISerializableOrderRecord'
		);
	}
}

export class SerializableOrderActionRecord
	implements WrappedEvent<'OrderActionRecord'>
{
	@autoserializeAs(String) eventType!: 'OrderActionRecord';
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) slot!: number;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) action!: OrderAction;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	actionExplanation!: OrderActionExplanation;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	marketType!: MarketType;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	filler!: PublicKey | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillerReward: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillRecordId: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	baseAssetAmountFilled: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	quoteAssetAmountFilled: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) takerFee: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) makerRebate: BN | null;
	@autoserializeAs(Number) referrerReward!: number | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	quoteAssetAmountSurplus: BN | null;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	taker!: PublicKey | null;
	@autoserializeAs(Number) takerOrderId!: number | null;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	takerOrderDirection!: PositionDirection | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	takerOrderBaseAssetAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	takerOrderCumulativeBaseAssetAmountFilled: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	takerOrderCumulativeQuoteAssetAmountFilled: BN | null;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	maker!: PublicKey | null;
	@autoserializeAs(Number) makerOrderId!: number | null;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	makerOrderDirection!: PositionDirection | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	makerOrderBaseAssetAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	makerOrderCumulativeBaseAssetAmountFilled: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	makerOrderCumulativeQuoteAssetAmountFilled: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) makerFee: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	spotFulfillmentMethodFee: BN | null;
	@autoserializeAs(Number) bitFlags!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	takerExistingQuoteEntryAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	takerExistingBaseAssetAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	makerExistingQuoteEntryAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	makerExistingBaseAssetAmount: BN | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) triggerPrice: BN | null;
	@autoserializeAs(Number) builderIdx!: number | null;
	@autoserializeUsing(BNSerializeAndDeserializeFns) builderFee: BN | null;

	static onDeserialized(
		data: JsonObject,
		instance: SerializableOrderActionRecord
	) {
		validateEventTypeOnDeserialize(
			instance,
			'OrderActionRecord',
			'SerializableOrderActionRecord'
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<SerializableOrderActionRecord>(
			json,
			'OrderActionRecord',
			'SerializableOrderActionRecord'
		);
	}
}

@inheritSerialization(SerializableOrderActionRecord)
export class UISerializableOrderActionRecord extends SerializableOrderActionRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	fillerReward: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmountFilled: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteAssetAmountFilled: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	takerFee: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	makerRebate: BigNum | null;

	//@ts-ignore
	@autoserializeAs(Number) referrerReward: number | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteAssetAmountSurplus: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	takerOrderBaseAssetAmount: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	takerOrderCumulativeBaseAssetAmountFilled: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	takerOrderCumulativeQuoteAssetAmountFilled: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	makerOrderBaseAssetAmount: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	makerOrderCumulativeBaseAssetAmountFilled: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	makerOrderCumulativeQuoteAssetAmountFilled: BigNum | null;

	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePrice: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	makerFee: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	spotFulfillmentMethodFee: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	takerExistingQuoteEntryAmount: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	takerExistingBaseAssetAmount: BigNum | null;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	makerExistingQuoteEntryAmount: BigNum | null;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	makerExistingBaseAssetAmount: BigNum | null;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableOrderActionRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		validateEventTypeOnDeserialize<UISerializableOrderActionRecord>(
			instance,
			'OrderActionRecord',
			'UISerializableOrderActionRecord'
		);

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(instance.marketType, instance.marketIndex),
			[
				'baseAssetAmountFilled',
				'takerOrderBaseAssetAmount',
				'takerOrderCumulativeBaseAssetAmountFilled',
				'makerOrderBaseAssetAmount',
				'makerOrderCumulativeBaseAssetAmountFilled',
				'takerExistingBaseAssetAmount',
				'makerExistingBaseAssetAmount',
			]
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<UISerializableOrderActionRecord>(
			json,
			'OrderActionRecord',
			'UISerializableOrderActionRecord'
		);
	}
}

export class UISerializableOrderRecordV2 {
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) orderType!: OrderType;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) marketType!: MarketType;
	@autoserializeAs(Number) orderId!: number;
	@autoserializeAs(Number) userOrderId!: number;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) price!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	baseAssetAmount!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	quoteAssetAmount!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	baseAssetAmountFilled!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	quoteAssetAmountFilled!: BigNum;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	direction!: PositionDirection;
	@autoserializeAs(Boolean) reduceOnly!: boolean;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	triggerPrice!: BigNum;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	triggerCondition!: OrderTriggerCondition;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	existingPositionDirection!: PositionDirection;
	@autoserializeAs(Boolean) postOnly!: boolean;
	@autoserializeAs(Boolean) immediateOrCancel!: boolean;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	oraclePriceOffset!: BigNum;
	@autoserializeAs(Number) auctionDuration!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	auctionStartPrice!: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	auctionEndPrice!: BigNum;
	@autoserializeUsing(BNSerializeAndDeserializeFns) maxTs: BN;
	@autoserializeAs(String) symbol!: string;
	@autoserializeUsing(BNSerializeAndDeserializeFns) lastUpdatedTs: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	lastActionExplanation!: OrderActionExplanation;
	@autoserializeAs(String) lastActionStatus!: string;
	@autoserializeAs(String) status!: string;
	@autoserializeUsing(NullableQuoteBigNumSerializeAndDeserializeFns)
	cumulativeFee!: BigNum | null;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableOrderRecordV2
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(instance.marketType, instance.marketIndex),
			['baseAssetAmount', 'baseAssetAmountFilled']
		);
	}
}

export class UISerializableOrderActionRecordBase {
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) marketType!: MarketType;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	fillerReward!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	baseAssetAmountFilled!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	quoteAssetAmountFilled!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) takerFee!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	makerRebate!: BigNum;
	@autoserializeAs(Number) referrerReward!: number;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	quoteAssetAmountSurplus!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	takerOrderBaseAssetAmount!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	takerOrderCumulativeBaseAssetAmountFilled!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	takerOrderCumulativeQuoteAssetAmountFilled!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	makerOrderBaseAssetAmount!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	makerOrderCumulativeBaseAssetAmountFilled!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	makerOrderCumulativeQuoteAssetAmountFilled!: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	oraclePrice!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) makerFee!: BigNum;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) action!: OrderAction;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	actionExplanation!: OrderActionExplanation;

	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) filler!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillRecordId: BN; //
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) taker!: PublicKey;
	@autoserializeAs(Number) takerOrderId!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	takerOrderDirection!: PositionDirection;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) maker!: PublicKey;
	@autoserializeAs(Number) makerOrderId!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	makerOrderDirection!: PositionDirection;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	spotFulfillmentMethodFee!: BigNum;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(String) symbol!: string;
	@autoserializeAs(Number) bitFlags!: number;

	@autoserializeUsing(NullableQuoteBigNumSerializeAndDeserializeFns)
	takerExistingQuoteEntryAmount!: BigNum | null;
	@autoserializeUsing(NullableMarketBasedBigNumSerializeAndDeserializeFns)
	takerExistingBaseAssetAmount!: BigNum | null;
	@autoserializeUsing(NullableQuoteBigNumSerializeAndDeserializeFns)
	makerExistingQuoteEntryAmount!: BigNum | null;
	@autoserializeUsing(NullableMarketBasedBigNumSerializeAndDeserializeFns)
	makerExistingBaseAssetAmount!: BigNum | null;
	@autoserializeUsing(NullablePriceBigNumSerializeAndDeserializeFns)
	triggerPrice!: BigNum | null;
	@autoserializeAs(Number) builderIdx!: number | null;
	@autoserializeUsing(NullableQuoteBigNumSerializeAndDeserializeFns)
	builderFee!: BigNum | null;
}

@inheritSerialization(UISerializableOrderActionRecordBase)
export class UISerializableOrderActionRecordV2 extends UISerializableOrderActionRecordBase {
	@autoserializeAs(String) eventType!: 'OrderActionRecord';

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableOrderActionRecordV2
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		validateEventTypeOnDeserialize<UISerializableOrderActionRecordV2>(
			instance,
			'OrderActionRecord',
			'UISerializableOrderActionRecordV2'
		);

		const keysToUse: (keyof UISerializableOrderActionRecordV2)[] = [
			'baseAssetAmountFilled',
			'takerOrderBaseAssetAmount',
			'takerOrderCumulativeBaseAssetAmountFilled',
			'makerOrderBaseAssetAmount',
			'makerOrderCumulativeBaseAssetAmountFilled',
			'takerExistingBaseAssetAmount',
			'makerExistingBaseAssetAmount',
		];

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(instance.marketType, instance.marketIndex),
			keysToUse
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<UISerializableOrderActionRecordV2>(
			json,
			'OrderActionRecord',
			'UISerializableOrderActionRecordV2'
		);
	}
}

@inheritSerialization(UISerializableOrderActionRecordBase)
export class UISerializablePositionHistoryRecord extends UISerializableOrderActionRecordBase {
	@autoserializeAs(String) eventType!: 'PositionHistoryRecord';
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	baseClosedForPnl!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	userFee!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	userExistingQuoteEntryAmount!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	userExistingBaseAssetAmount!: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializablePositionHistoryRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		validateEventTypeOnDeserialize<UISerializablePositionHistoryRecord>(
			instance,
			'PositionHistoryRecord',
			'UISerializablePositionHistoryRecord'
		);

		const keysToUse: (keyof UISerializablePositionHistoryRecord)[] = [
			'baseAssetAmountFilled',
			'takerOrderBaseAssetAmount',
			'takerOrderCumulativeBaseAssetAmountFilled',
			'makerOrderBaseAssetAmount',
			'makerOrderCumulativeBaseAssetAmountFilled',
			'takerExistingBaseAssetAmount',
			'makerExistingBaseAssetAmount',
			'userExistingBaseAssetAmount',
			'baseClosedForPnl',
		];

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(instance.marketType, instance.marketIndex),
			keysToUse
		);
	}

	static onSerialized(json: JsonObject) {
		validateEventTypeOnSerialize<UISerializablePositionHistoryRecord>(
			json,
			'PositionHistoryRecord',
			'UISerializablePositionHistoryRecord'
		);
	}
}

export type DepositRecordEvent = Event<DepositRecord>;

export class SerializableDepositRecord implements DepositRecordEvent {
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) depositRecordId: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	userAuthority!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) direction!: {
		deposit?: any;
		withdraw?: any;
	};
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) amount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) marketDepositBalance: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) marketWithdrawBalance: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	marketCumulativeDepositInterest: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	marketCumulativeBorrowInterest: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	transferUser?: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalDepositsAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalWithdrawsAfter: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	explanation!: DepositExplanation;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) signer?: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) userTokenAmountAfter: BN;
}

@inheritSerialization(SerializableDepositRecord)
export class UISerializableDepositRecord extends SerializableDepositRecord {
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	amount: BigNum;

	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePrice: BigNum;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketDepositBalance: BigNum;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketWithdrawBalance: BigNum;

	@autoserializeUsing(BankCumulativeInterestBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketCumulativeDepositInterest: BigNum;

	@autoserializeUsing(BankCumulativeInterestBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketCumulativeBorrowInterest: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalDepositsAfter: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalWithdrawsAfter: BigNum;

	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	userTokenAmountAfter: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableDepositRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(MarketType.SPOT, instance.marketIndex),
			[
				'amount',
				'marketDepositBalance',
				'marketWithdrawBalance',
				'userTokenAmountAfter',
			]
		);
	}
}

// Spot interest record event
export type SpotInterestRecordEvent = Event<SpotInterestRecord>;
export class SerializableSpotInterestRecord implements SpotInterestRecordEvent {
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) depositBalance: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeDepositInterest: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) borrowBalance: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeBorrowInterest: BN;
	@autoserializeAs(Number) optimalUtilization!: number;
	@autoserializeAs(Number) optimalBorrowRate!: number;
	@autoserializeAs(Number) maxBorrowRate!: number;
}

// Curve record event
export type AmmCurveChangedEvent = Event<AmmCurveChanged>;
export class SerializableAmmCurveChanged implements AmmCurveChangedEvent {
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pegMultiplierBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetReserveBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetReserveBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) sqrtKBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pegMultiplierAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetReserveAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetReserveAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) sqrtKAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) adjustmentCost: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	totalFeeMinusDistributionsAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePrice: BN;
}

// Settle Pnl Records

export type SettlePnlRecordEvent = Event<SettlePnlRecord>;

export class SerializableSettlePnlRecord implements SettlePnlRecordEvent {
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	user!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pnl: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetAmountAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteEntryAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) settlePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePrice: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	explanation!: SettlePnlExplanation;
}

@inheritSerialization(SerializableSettlePnlRecord)
export class UISerializableSettlePnlRecord extends SerializableSettlePnlRecord {
	//@ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) pnl: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmount: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteAssetAmountAfter: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteEntryAmount: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	settlePrice: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePrice: BigNum;
}

//// FundingRate Records

export type FundingRateRecordEvent = Event<FundingRateRecord>;
// @ts-ignore
export class SerializableFundingRateRecord implements FundingRateRecordEvent {
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) slot!: number;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) recordId: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fundingRate: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeFundingRateLong: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeFundingRateShort: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePriceTwap: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) markPriceTwap: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fundingRateLong: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fundingRateShort: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) periodRevenue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	baseAssetAmountWithAmm: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	baseAssetAmountWithUnsettledLp: BN;
}

@inheritSerialization(SerializableFundingRateRecord)
export class UISerializableFundingRateRecord extends SerializableFundingRateRecord {
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	fundingRate: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeFundingRateLong: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeFundingRateShort: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePriceTwap: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	markPriceTwap: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	fundingRateLong: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	fundingRateShort: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	periodRevenue: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmountWithAmm: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmountWithUnsettledLp: BigNum;
}

//// FundingPayment Records

export type FundingPaymentRecordEvent = Event<FundingPaymentRecord>;

export class SerializableFundingPaymentRecord
	implements FundingPaymentRecordEvent
{
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	userAuthority!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fundingPayment: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	userLastCumulativeFunding: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	ammCumulativeFundingLong: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	ammCumulativeFundingShort: BN;
}

@inheritSerialization(SerializableFundingPaymentRecord)
export class UISerializableFundingPaymentRecord extends SerializableFundingPaymentRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	fundingPayment: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmount: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	userLastCumulativeFunding: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	ammCumulativeFundingLong: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	ammCumulativeFundingShort: BigNum;
}

//// Liquidation Records
export class SerializableLiquidatePerpRecord implements LiquidatePerpRecord {
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetAmount: BN;
	@autoserializeAs(Number) userOrderId!: number;
	@autoserializeAs(Number) liquidatorOrderId!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillRecordId: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) liquidatorFee: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifFee: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) protocolFee: BN;
}

@inheritSerialization(SerializableLiquidatePerpRecord)
export class UISerializableLiquidatePerpRecord extends SerializableLiquidatePerpRecord {
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oraclePrice: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	baseAssetAmount: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteAssetAmount: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	liquidatorFee: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	ifFee: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	protocolFee: BigNum;
}

export class SerializableLiquidateSpotRecord implements LiquidateSpotRecord {
	@autoserializeAs(Number) assetMarketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) assetPrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) assetTransfer: BN;
	@autoserializeAs(Number) liabilityMarketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) liabilityPrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) liabilityTransfer: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifFee: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) protocolFee: BN;
}

@inheritSerialization(SerializableLiquidateSpotRecord)
export class UISerializableLiquidateSpotRecord extends SerializableLiquidateSpotRecord {
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	assetPrice: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	assetTransfer: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	liabilityPrice: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	liabilityTransfer: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableLiquidateSpotRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');
		instance.assetTransfer.precision =
			Config.spotMarketsLookup[instance.assetMarketIndex].precisionExp;
		instance.liabilityTransfer.precision =
			Config.spotMarketsLookup[instance.liabilityMarketIndex].precisionExp;
	}
}

export class SerializableLiquidateBorrowForPerpPnlRecord
	implements LiquidateBorrowForPerpPnlRecord
{
	@autoserializeUsing(BNSerializeAndDeserializeFns) marketOraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pnlTransfer: BN;
	@autoserializeAs(Number) liabilityMarketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) liabilityPrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) liabilityTransfer: BN;
	@autoserializeAs(Number) perpMarketIndex!: number;
}

@inheritSerialization(SerializableLiquidateBorrowForPerpPnlRecord)
export class UISerializableLiquidateBorrowForPerpPnlRecord extends SerializableLiquidateBorrowForPerpPnlRecord {
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketOraclePrice: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	pnlTransfer: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	liabilityPrice: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	liabilityTransfer: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableLiquidateBorrowForPerpPnlRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');
		instance.liabilityTransfer.precision =
			Config.spotMarketsLookup[instance.liabilityMarketIndex].precisionExp;
	}
}

export class SerializableLiquidatePerpPnlForDepositRecord
	implements LiquidatePerpPnlForDepositRecord
{
	@autoserializeUsing(BNSerializeAndDeserializeFns) marketOraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pnlTransfer: BN;
	@autoserializeAs(Number) assetMarketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) assetPrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) assetTransfer: BN;
	@autoserializeAs(Number) perpMarketIndex!: number;
}

@inheritSerialization(SerializableLiquidatePerpPnlForDepositRecord)
export class UISerializableLiquidatePerpPnlForDepositRecord extends SerializableLiquidatePerpPnlForDepositRecord {
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marketOraclePrice: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	pnlTransfer: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	assetPrice: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	assetTransfer: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableLiquidatePerpPnlForDepositRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');
		instance.assetTransfer.precision =
			Config.spotMarketsLookup[instance.assetMarketIndex].precisionExp;
	}
}

export type LiquidationRecordEvent = Event<LiquidationRecord>;

export class SerializablePerpBankrupcyRecord implements PerpBankruptcyRecord {
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) pnl: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeFundingRateDelta: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifPayment: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	clawbackUser!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) clawbackUserPayment: BN;
}

export class UISerializablePerpBankrupcyRecord extends SerializablePerpBankrupcyRecord {
	//@ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) pnl: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeFundingRateDelta: BigNum;
	//@ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) ifPayment: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	declare clawbackUserPayment: BN;
}

export class SerializableSpotBankruptcyRecord implements SpotBankruptcyRecord {
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) borrowAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeDepositInterestDelta: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifPayment: BN;
}

export class UISerializableSpotBankruptcyRecord extends SerializableSpotBankruptcyRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	borrowAmount: BigNum;
	@autoserializeUsing(BankCumulativeInterestBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeDepositInterestDelta: BigNum;

	//@ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) ifPayment: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableSpotBankruptcyRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');
		instance.ifPayment.precision =
			Config.spotMarketsLookup[instance.marketIndex].precisionExp;
	}
}

export class SerializableLiquidationRecord implements LiquidationRecordEvent {
	@autoserializeAs(Number) liquidationId!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	liquidator!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalCollateral: BN;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	liquidationType!: LiquidationType;
	@autoserializeUsing(BNSerializeAndDeserializeFns) marginRequirement: BN;
	@autoserializeAs(SerializableLiquidatePerpRecord)
	liquidatePerp!: LiquidatePerpRecord;
	@autoserializeAs(SerializableLiquidateSpotRecord)
	liquidateSpot!: LiquidateSpotRecord;
	@autoserializeAs(SerializableLiquidateBorrowForPerpPnlRecord)
	liquidateBorrowForPerpPnl!: LiquidateBorrowForPerpPnlRecord;
	@autoserializeAs(SerializableLiquidatePerpPnlForDepositRecord)
	liquidatePerpPnlForDeposit!: LiquidatePerpPnlForDepositRecord;
	@autoserializeAs(SerializablePerpBankrupcyRecord)
	perpBankruptcy!: PerpBankruptcyRecord;
	@autoserializeAs(SerializableSpotBankruptcyRecord)
	spotBankruptcy!: SpotBankruptcyRecord;
	@autoserializeAsArray(Number) canceledOrderIds!: number[];
	@autoserializeUsing(BNSerializeAndDeserializeFns) marginFreed: BN;
	@autoserializeAs(Boolean) bankrupt!: boolean;
	@autoserializeAs(Number) bitFlags!: number;
}

@inheritSerialization(SerializableLiquidationRecord)
export class UISerializableLiquidationRecord extends SerializableLiquidationRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	marginRequirement: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalCollateral: BigNum;
	@autoserializeAs(UISerializableLiquidatePerpRecord)
	//@ts-ignore
	liquidatePerp: UISerializableLiquidatePerpRecord;
	@autoserializeAs(UISerializableLiquidateSpotRecord)
	//@ts-ignore
	liquidateSpot: UISerializableLiquidateSpotRecord;
	@autoserializeAs(UISerializableLiquidateBorrowForPerpPnlRecord)
	//@ts-ignore
	liquidateBorrowForPerpPnl: UISerializableLiquidateBorrowForPerpPnlRecord;
	@autoserializeAs(UISerializableLiquidatePerpPnlForDepositRecord)
	//@ts-ignore
	liquidatePerpPnlForDeposit: UISerializableLiquidatePerpPnlForDepositRecord;
}

export class UISerializableLiquidationRecordV2 {
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	liquidationType!: LiquidationType;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	user!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	liquidator!: PublicKey;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	marginRequirement!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	totalCollateral!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) marginFreed: BN;
	@autoserializeAs(Number) liquidationId!: number;
	@autoserializeAs(Boolean) bankrupt!: boolean;
	@autoserializeAs(Number) bitFlags!: number;
	@autoserializeAsArray(Number)
	canceledOrderIds!: number[];

	// Liquidate Perp
	@autoserializeAs(Number) liquidatePerp_marketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidatePerp_oraclePrice!: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	liquidatePerp_baseAssetAmount!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidatePerp_quoteAssetAmount!: BigNum;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	liquidatePerp_fillRecordId: BN;
	@autoserializeAs(Number)
	liquidatePerp_userOrderId!: number;
	@autoserializeAs(Number)
	liquidatePerp_liquidatorOrderId!: number;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidatePerp_liquidatorFee!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidatePerp_ifFee!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidatePerp_protocolFee!: BigNum;

	// Liquidate Spot
	@autoserializeAs(Number) liquidateSpot_assetMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidateSpot_assetPrice!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	liquidateSpot_assetTransfer!: BigNum;
	@autoserializeAs(Number) liquidateSpot_liabilityMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidateSpot_liabilityPrice!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	liquidateSpot_liabilityTransfer!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	liquidateSpot_ifFee!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	liquidateSpot_protocolFee!: BigNum;

	// Liquidate Borrow For Perp PnL
	@autoserializeAs(Number) liquidateBorrowForPerpPnl_perpMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidateBorrowForPerpPnl_marketOraclePrice!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidateBorrowForPerpPnl_pnlTransfer!: BigNum;
	@autoserializeAs(Number)
	liquidateBorrowForPerpPnl_liabilityMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidateBorrowForPerpPnl_liabilityPrice!: BigNum;
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	liquidateBorrowForPerpPnl_liabilityTransfer!: BigNum;

	// Liquidate Perp PnL For Deposit
	@autoserializeAs(Number) liquidatePerpPnlForDeposit_perpMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidatePerpPnlForDeposit_marketOraclePrice!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	liquidatePerpPnlForDeposit_pnlTransfer!: BigNum;
	@autoserializeAs(Number)
	liquidatePerpPnlForDeposit_assetMarketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	liquidatePerpPnlForDeposit_assetPrice!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	liquidatePerpPnlForDeposit_assetTransfer!: BigNum;

	// Perp Bankruptcy
	@autoserializeAs(Number) perpBankruptcy_marketIndex!: number;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	perpBankruptcy_pnl!: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	perpBankruptcy_ifPayment!: BigNum;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	perpBankruptcy_clawbackUser!: PublicKey;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	perpBankruptcy_clawbackUserPayment!: BigNum;
	@autoserializeUsing(FundingRateBigNumSerializeAndDeserializeFns)
	perpBankruptcy_cumulativeFundingRateDelta!: BigNum;

	// Spot Bankruptcy
	@autoserializeAs(Number) spotBankruptcy_marketIndex!: number;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	spotBankruptcy_borrowAmount!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	spotBankruptcy_ifPayment!: BigNum;
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	spotBankruptcy_cumulativeDepositInterestDelta!: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableLiquidationRecordV2
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		// handle spot liquidation
		const spotLiquidationAssetPrecision = getPrecisionToUse(
			MarketType.SPOT,
			instance.liquidateSpot_assetMarketIndex
		);

		const spotLiquidationLiabilityPrecision = getPrecisionToUse(
			MarketType.SPOT,
			instance.liquidateSpot_liabilityMarketIndex
		);

		handleOnDeserializedPrecision(
			data,
			instance,
			spotLiquidationAssetPrecision,
			['liquidateSpot_assetTransfer']
		); // The asset transfer uses the asset market index precision

		handleOnDeserializedPrecision(
			data,
			instance,
			spotLiquidationLiabilityPrecision,
			['liquidateSpot_liabilityTransfer', 'liquidateSpot_ifFee']
		); // the liability transfer and if fee use the liability market index precision

		// handle spot bankruptcy
		const spotBankruptcyPrecisionToUse = getPrecisionToUse(
			MarketType.SPOT,
			instance.spotBankruptcy_marketIndex
		);
		handleOnDeserializedPrecision(
			data,
			instance,
			spotBankruptcyPrecisionToUse,
			[
				'spotBankruptcy_borrowAmount',
				'spotBankruptcy_ifPayment',
				'spotBankruptcy_cumulativeDepositInterestDelta',
			]
		);

		// handle liquidate borrow for perp pnl
		const liquidateBorrowForPerpPnlPrecisionToUse = getPrecisionToUse(
			MarketType.SPOT,
			instance.liquidateBorrowForPerpPnl_liabilityMarketIndex
		);
		handleOnDeserializedPrecision(
			data,
			instance,
			liquidateBorrowForPerpPnlPrecisionToUse,
			['liquidateBorrowForPerpPnl_liabilityTransfer']
		);

		// handle liquidate perp pnl for deposit
		const liquidatePerpPnlForDepositPrecisionToUse = getPrecisionToUse(
			MarketType.SPOT,
			instance.liquidatePerpPnlForDeposit_assetMarketIndex
		);
		handleOnDeserializedPrecision(
			data,
			instance,
			liquidatePerpPnlForDepositPrecisionToUse,
			['liquidatePerpPnlForDeposit_assetTransfer']
		);
	}
}

class SerializableUserPerpPositionSnapshot implements UserPerpPositionSnapshot {
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteAssetAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseAssetAmount: BN;
	@autoserializeAs(Number) marketIndex!: number;
}

class SerializableUserSpotPositionSnapshot implements UserSpotPositionSnapshot {
	@autoserializeUsing(BNSerializeAndDeserializeFns) tokenValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) tokenAmount: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) cumulativeDeposits: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) balanceInterestDelta: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) type!: SpotBalanceType;
}

export class SerializableUserSnapshotRecord implements UserSnapshotRecord {
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	programId!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	authority!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(Number) epochTs!: number;
	@autoserializeAs(Number) ts!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) perpPositionUpnl: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalAccountValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeDepositQuoteValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeWithdrawalQuoteValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeSettledPerpPnl: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeReferralReward: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeReferralVolume: BN;
	@autoserializeAs(Number) cumulativeReferralCount!: number;
}

@inheritSerialization(SerializableUserSnapshotRecord)
export class UISerializableUserSnapshotRecord extends SerializableUserSnapshotRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	perpPositionUpnl: BigNum;
	//@ts-ignore
	totalAccountValue: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeDepositQuoteValue: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeWithdrawalQuoteValue: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeSettledPerpPnl: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeReferralReward: BigNum;
	@autoserializeUsing(ReferralVolumeBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeReferralVolume: BigNum;
}

export class SerializableCandle {
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillOpen: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillClose: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillHigh: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fillLow: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oracleOpen: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oracleClose: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oracleHigh: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) oracleLow: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) quoteVolume: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) baseVolume: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) start: BN;
	@autoserializeAs(String) resolution!: CandleResolution;
}

@inheritSerialization(SerializableCandle)
export class UISerializableCandle extends SerializableCandle {
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) fillOpen: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) fillClose: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) fillHigh: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) fillLow: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) oracleOpen: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	oracleClose: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) oracleHigh: BigNum;
	//@ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) oracleLow: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	quoteVolume: BigNum;
	//@ts-ignore
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns) baseVolume: BigNum;
	//@ts-ignore
	@autoserializeAs(String) resolution: CandleResolution;
}

export class SerializableRollingPnlData implements RollingPnlData {
	@autoserializeUsing(BNSerializeAndDeserializeFns) spotPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) spotPnlPct: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) perpPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) perpPnlPct: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalPnlPct: BN;
}

export class SerializableAllTimePnlData extends SerializableRollingPnlData {
	@autoserializeAs(Number) epochTs!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) spotPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) spotPnlPct: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) perpPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) perpPnlPct: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalPnlQuote: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalPnlPct: BN;
}

export class UISerializableRollingPnlData extends SerializableRollingPnlData {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	spotPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	spotPnlPct: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	perpPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	perpPnlPct: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalPnlPct: BigNum;
}

export class UISerializableAllTimePnlData extends UISerializableRollingPnlData {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	spotPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	spotPnlPct: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	perpPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	perpPnlPct: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalPnlQuote: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalPnlPct: BigNum;

	@autoserializeAs(Number)
	epochTs!: number;
}

export class UIMatchedOrderRecordAndAction {
	@autoserializeAs(UISerializableOrderRecord)
	orderRecord!: UISerializableOrderRecord;
	@autoserializeAs(UISerializableOrderActionRecord)
	actionRecord!: UISerializableOrderActionRecord;
}

class SerializablePnlDataPoint implements PnlHistoryDataPoint {
	@autoserializeAs(Number) ts!: number;
	@autoserializeAs(Number) val!: number;
}

class SerializableLeaderBoardResultRow implements LeaderBoardResultRow {
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	user!: PublicKey;

	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	authority!: PublicKey;

	@autoserializeUsing(EnumSerializeAndDeserializeFns)
	resolution!: SnapshotEpochResolution;

	@autoserializeAs(Number)
	rollingValue!: number;

	@autoserializeAs(Number)
	subaccountId!: number;

	@autoserializeAsArray(SerializablePnlDataPoint)
	pnlHistoryPoints!: SerializablePnlDataPoint[];
}

export class SerializableLeaderboardResult implements LeaderboardResult {
	@autoserializeAs(Number) lastUpdateTs!: number;
	@autoserializeAs(String) ordering!: PnlSnapshotOrderOption;
	@autoserializeAsArray(SerializableLeaderBoardResultRow)
	results!: SerializableLeaderBoardResultRow[];
}

@inheritSerialization(SerializableLeaderBoardResultRow)
class UISerializableLeaderBoardResultRow extends SerializableLeaderBoardResultRow {}

@inheritSerialization(SerializableLeaderboardResult)
export class UISerializableLeaderboardResult extends SerializableLeaderboardResult {
	@autoserializeAsArray(UISerializableLeaderBoardResultRow)
	//@ts-ignore
	results: UISerializableLeaderBoardResultRow[];
}

export class SerializableNewUserRecord implements NewUserRecord {
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	userAuthority!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(Number) userId!: number;
	@autoserializeAsArray(Number) name!: number[];
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) referrer!: PublicKey;
	@autoserializeAs(Number) subAccountId!: number;
}

export class SerializableAccountSnapshot implements AccountSnapshot {
	@autoserializeUsing(BNSerializeAndDeserializeFns) authority!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(Number) epochTs!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	totalAccountValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeDepositQuoteValue: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeWithdrawalQuoteValue: BN;

	@autoserializeUsing(BNSerializeAndDeserializeFns)
	allTimeTotalPnlPct: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	allTimeTotalPnl: BN;

	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeReferralReward: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeReferralVolume: BN;
	@autoserializeAs(Number) cumulativeReferralCount!: number;

	@autoserializeUsing(BNSerializeAndDeserializeFns)
	cumulativeSettledPerpPnl: BN;
}

export class UISerializableAccountSnapshot implements UIAccountSnapshot {
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	authority!: PublicKey;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeAs(Number) epochTs!: number;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalAccountValue: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeDepositQuoteValue: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeWithdrawalQuoteValue: BigNum;

	@autoserializeUsing(PctBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	allTimeTotalPnlPct: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	allTimeTotalPnl: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeReferralReward: BigNum;
	@autoserializeUsing(ReferralVolumeBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeReferralVolume: BigNum;
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	cumulativeSettledPerpPnl: BigNum;

	@autoserializeAs(Number) cumulativeReferralCount!: number;
}

export class SerializableDlobOrder {
	@autoserializeAs(String) user!: string;
	@autoserializeAs(UISerializableOrder) order!: UISerializableOrder;
}

export class SerializableDlobOracleInfo {
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns) price!: BigNum;
	@autoserializeUsing(BNSerializeAndDeserializeFns) slot: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) confidence: BN;
	@autoserializeAs(Boolean) hasSufficientNumberOfDataPoints!: boolean;
	@autoserializeUsing(BNSerializeAndDeserializeFns) twap: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) twapConfidence: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) maxPrice?: BN;
}

export class SerializableDLOBState {
	@autoserializeAs(Number) slot!: number;
	@autoserializeAsArray(SerializableDlobOracleInfo)
	oracles!: SerializableDlobOracleInfo[];
	@autoserializeAsArray(SerializableDlobOrder) orders!: SerializableDlobOrder[];
}

export class CompetitionResultEntry {
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) wallet!: PublicKey;
	@autoserializeAs(Number) value!: number;
	@autoserializeAs(Number) rank!: number;
	@autoserializeAsJson() metadata?: any;
}

export class CompetitionResult {
	@autoserializeAs(String) competitionName!: string;
	@autoserializeAs(String) lastUpdate!: string;
	@autoserializeAs(Number) lastUpdateTs!: number;
	@autoserializeAs(Number) startTs!: number;
	@autoserializeAs(Number) endTs!: number;
	@autoserializeAsArray(CompetitionResultEntry)
	results!: CompetitionResultEntry[];
	@autoserializeAs(CompetitionResultEntry)
	requestedAuthorityResult?: CompetitionResultEntry;
}

export type InsuranceFundRecordEvent = Event<InsuranceFundRecord>;

export class SerializableInsuranceFundRecord
	implements InsuranceFundRecordEvent
{
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeAs(Number) spotMarketIndex!: number;
	@autoserializeAs(Number) perpMarketIndex!: number;
	@autoserializeAs(Number) userIfFactor!: number;
	@autoserializeAs(Number) totalIfFactor!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) vaultAmountBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	insuranceVaultAmountBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalIfSharesBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalIfSharesAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) amount: BN;
}

@inheritSerialization(SerializableInsuranceFundRecord)
export class UISerializableInsuranceFundRecord extends SerializableInsuranceFundRecord {
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	vaultAmountBefore: BigNum;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	insuranceVaultAmountBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalIfSharesBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalIfSharesAfter: BigNum;

	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	amount: BigNum;

	static onDeserialized(
		_data: JsonObject,
		instance: UISerializableInsuranceFundRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');
		try {
			const precisionToUse =
				Config.spotMarketsLookup[instance.spotMarketIndex].precisionExp;

			instance.vaultAmountBefore.precision = precisionToUse;
			instance.insuranceVaultAmountBefore.precision = precisionToUse;
			instance.amount.precision = precisionToUse;
		} catch (e) {
			// ignore: fall back to default precision if market lookup fails
		}
	}
}

export type InsuranceFundStakeRecordEvent = Event<InsuranceFundStakeRecord>;

export class SerializableInsuranceFundStakeRecord
	implements InsuranceFundStakeRecordEvent
{
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns)
	userAuthority!: PublicKey;
	@autoserializeUsing(EnumSerializeAndDeserializeFns) action!: StakeAction;
	@autoserializeUsing(BNSerializeAndDeserializeFns) amount: BN;
	@autoserializeAs(Number) marketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns)
	insuranceVaultAmountBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifSharesBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) userIfSharesBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalIfSharesBefore: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ifSharesAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) userIfSharesAfter: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) totalIfSharesAfter: BN;
}

@inheritSerialization(SerializableInsuranceFundStakeRecord)
export class UISerializableInsuranceFundStakeRecord extends SerializableInsuranceFundStakeRecord {
	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	amount: BigNum;

	@autoserializeUsing(MarketBasedBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	insuranceVaultAmountBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	ifSharesBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	userIfSharesBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalIfSharesBefore: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	ifSharesAfter: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	userIfSharesAfter: BigNum;

	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns)
	//@ts-ignore
	totalIfSharesAfter: BigNum;

	static onDeserialized(
		data: JsonObject,
		instance: UISerializableInsuranceFundStakeRecord
	) {
		assert(Config.initialized, 'Common Config Not Initialised');

		handleOnDeserializedPrecision(
			data,
			instance,
			getPrecisionToUse(MarketType.SPOT, instance.marketIndex),
			['amount', 'insuranceVaultAmountBefore']
		);
	}
}

// Swap Record
export type SwapRecordEvent = Event<SwapRecord>;

export class SerializableSwapRecord implements SwapRecordEvent {
	@autoserializeAs(Number) id!: number;
	@autoserializeAs(String) txSig!: string;
	@autoserializeAs(Number) txSigIndex!: number;
	@autoserializeAs(Number) slot!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) ts: BN;
	@autoserializeUsing(PublicKeySerializeAndDeserializeFns) user!: PublicKey;
	@autoserializeUsing(BNSerializeAndDeserializeFns) amountOut: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) amountIn: BN;
	@autoserializeAs(Number) outMarketIndex!: number;
	@autoserializeAs(Number) inMarketIndex!: number;
	@autoserializeUsing(BNSerializeAndDeserializeFns) outOraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) inOraclePrice: BN;
	@autoserializeUsing(BNSerializeAndDeserializeFns) fee: BN;
}

@inheritSerialization(SerializableSwapRecord)
export class UISerializableSwapRecord extends SerializableSwapRecord {
	// @ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) amountOut: BigNum;
	// @ts-ignore
	@autoserializeUsing(QuoteBigNumSerializeAndDeserializeFns) amountIn: BigNum;
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	outOraclePrice: BigNum;
	// @ts-ignore
	@autoserializeUsing(PriceBigNumSerializeAndDeserializeFns)
	// @ts-ignore
	inOraclePrice: BigNum;
	// @ts-ignore
	@autoserializeUsing(BaseBigNumSerializeAndDeserializeFns) fee: BigNum;

	static onDeserialized(_data: JsonObject, instance: UISerializableSwapRecord) {
		assert(Config.initialized, 'Common Config Not Initialised');
		try {
			const outPrecision =
				Config.spotMarketsLookup[instance.outMarketIndex].precisionExp;
			const inPrecision =
				Config.spotMarketsLookup[instance.inMarketIndex].precisionExp;

			instance.amountIn.precision = inPrecision;
			instance.amountOut.precision = outPrecision;
			instance.inOraclePrice.precision = inPrecision;
			instance.outOraclePrice.precision = outPrecision;
			instance.fee.precision = inPrecision;
		} catch (e) {
			logger.error('Error in swap serializer', e);
		}
	}
}

export function transformDataApiOrderRecordToUISerializableOrderRecord(
	v2Record: JsonObject
): UISerializableOrderRecord {
	const deserializedV2Record = Deserialize(
		v2Record,
		UISerializableOrderRecordV2
	)!;

	const transformedRecord: UISerializableOrderRecord = {
		eventType: 'OrderRecord',
		txSig: deserializedV2Record.txSig,
		txSigIndex: deserializedV2Record.txSigIndex,
		slot: deserializedV2Record.slot,
		ts: deserializedV2Record.ts,
		user: deserializedV2Record.user,
		order: {
			price: deserializedV2Record.price,
			baseAssetAmount: deserializedV2Record.baseAssetAmount,
			baseAssetAmountFilled: deserializedV2Record.baseAssetAmountFilled,
			quoteAssetAmountFilled: deserializedV2Record.quoteAssetAmountFilled,
			triggerPrice: deserializedV2Record.triggerPrice,
			oraclePriceOffset: deserializedV2Record.oraclePriceOffset,
			auctionStartPrice: deserializedV2Record.auctionStartPrice,
			auctionEndPrice: deserializedV2Record.auctionEndPrice,
			orderType: deserializedV2Record.orderType,
			orderId: deserializedV2Record.orderId,
			userOrderId: deserializedV2Record.userOrderId,
			marketIndex: deserializedV2Record.marketIndex,
			status: deserializedV2Record.status,
			ts: deserializedV2Record.ts,
			direction: deserializedV2Record.direction,
			reduceOnly: deserializedV2Record.reduceOnly,
			triggerCondition: deserializedV2Record.triggerCondition,
			postOnly: deserializedV2Record.postOnly,
			immediateOrCancel: deserializedV2Record.immediateOrCancel,
			existingPositionDirection: deserializedV2Record.existingPositionDirection,
			auctionDuration: deserializedV2Record.auctionDuration,
			slot: new BN(deserializedV2Record.slot),
			marketType: deserializedV2Record.marketType,
			maxTs: new BN(deserializedV2Record.maxTs),
			// @ts-ignore
			bitFlags: deserializedV2Record.bitFlags,
			// @ts-ignore
			postedSlotTail: deserializedV2Record.postedSlotTail,
		},
	};

	return transformedRecord;
}

export function transformDataApiOrderRecordToSerializableOrderRecord(
	v2Record: JsonObject
): SerializableOrderRecord {
	const deserializedV2Record = Deserialize(
		v2Record,
		UISerializableOrderRecordV2
	)!;

	const transformedRecord: SerializableOrderRecord = {
		eventType: 'OrderRecord',
		txSig: deserializedV2Record.txSig,
		txSigIndex: deserializedV2Record.txSigIndex,
		slot: deserializedV2Record.slot,
		ts: deserializedV2Record.ts,
		user: deserializedV2Record.user,
		order: {
			price: deserializedV2Record.price.val,
			baseAssetAmount: deserializedV2Record.baseAssetAmount.val,
			baseAssetAmountFilled: deserializedV2Record.baseAssetAmountFilled.val,
			quoteAssetAmountFilled: deserializedV2Record.quoteAssetAmountFilled.val,
			triggerPrice: deserializedV2Record.triggerPrice.val,
			oraclePriceOffset: deserializedV2Record.oraclePriceOffset.val,
			auctionStartPrice: deserializedV2Record.auctionStartPrice.val,
			auctionEndPrice: deserializedV2Record.auctionEndPrice.val,
			orderType: deserializedV2Record.orderType,
			orderId: deserializedV2Record.orderId,
			userOrderId: deserializedV2Record.userOrderId,
			marketIndex: deserializedV2Record.marketIndex,
			status: deserializedV2Record.status,
			direction: deserializedV2Record.direction,
			reduceOnly: deserializedV2Record.reduceOnly,
			triggerCondition: deserializedV2Record.triggerCondition,
			postOnly: deserializedV2Record.postOnly,
			immediateOrCancel: deserializedV2Record.immediateOrCancel,
			existingPositionDirection: deserializedV2Record.existingPositionDirection,
			auctionDuration: deserializedV2Record.auctionDuration,
			slot: new BN(deserializedV2Record.slot),
			marketType: deserializedV2Record.marketType,
			maxTs: new BN(deserializedV2Record.maxTs),
			// @ts-ignore
			bitFlags: deserializedV2Record.bitFlags,
			// @ts-ignore
			postedSlotTail: deserializedV2Record.postedSlotTail,
		},
	};

	return transformedRecord;
}

export function transformDataApiOrderActionRecordToUISerializableOrderActionRecord(
	v2Record: JsonObject
): UISerializableOrderActionRecord {
	const deserializedV2Record = Deserialize(
		{ ...v2Record, eventType: 'OrderActionRecord' },
		UISerializableOrderActionRecordV2
	)!;

	const transformedRecord: UISerializableOrderActionRecord = {
		...deserializedV2Record,
	};

	return transformedRecord;
}

export function transformDataApiPositionHistoryRecordToUISerializablePositionHistoryRecord(
	v2Record: JsonObject
): UISerializablePositionHistoryRecord {
	try {
		const deserializedV2Record = Deserialize(
			{ ...v2Record, eventType: 'PositionHistoryRecord' },
			UISerializablePositionHistoryRecord
		)!;
		const transformedRecord: UISerializablePositionHistoryRecord = {
			...deserializedV2Record,
		};

		return transformedRecord;
	} catch (e) {
		logger.error(
			'Error in transformDataApiPositionHistoryRecordToUISerializablePositionHistoryRecord',
			e
		);
		throw e;
	}
}

export function transformDataApiOrderActionRecordToSerializableOrderActionRecord(
	v2Record: JsonObject
): SerializableOrderActionRecord {
	const deserializedV2Record = Deserialize(
		{
			...v2Record,
			eventType: 'OrderActionRecord',
		},
		UISerializableOrderActionRecordV2
	)!;

	const transformedRecord: SerializableOrderActionRecord = {
		...deserializedV2Record,
		fillerReward: deserializedV2Record.fillerReward.val,
		makerRebate: deserializedV2Record.makerRebate.val,
		takerFee: deserializedV2Record.takerFee.val,
		baseAssetAmountFilled: deserializedV2Record.baseAssetAmountFilled.val,
		quoteAssetAmountFilled: deserializedV2Record.quoteAssetAmountFilled.val,
		referrerReward: deserializedV2Record.referrerReward,
		ts: new BN(deserializedV2Record.ts),
		txSig: deserializedV2Record.txSig,
		txSigIndex: deserializedV2Record.txSigIndex,
		quoteAssetAmountSurplus: deserializedV2Record.quoteAssetAmountSurplus.val,
		takerOrderBaseAssetAmount:
			deserializedV2Record.takerOrderBaseAssetAmount.val,
		takerOrderCumulativeBaseAssetAmountFilled:
			deserializedV2Record.takerOrderCumulativeBaseAssetAmountFilled.val,
		takerOrderCumulativeQuoteAssetAmountFilled:
			deserializedV2Record.takerOrderCumulativeQuoteAssetAmountFilled.val,
		makerOrderBaseAssetAmount:
			deserializedV2Record.makerOrderBaseAssetAmount.val,
		makerOrderCumulativeBaseAssetAmountFilled:
			deserializedV2Record.makerOrderCumulativeBaseAssetAmountFilled.val,
		makerOrderCumulativeQuoteAssetAmountFilled:
			deserializedV2Record.makerOrderCumulativeQuoteAssetAmountFilled.val,
		oraclePrice: deserializedV2Record.oraclePrice.val,
		makerFee: deserializedV2Record.makerFee.val,
		spotFulfillmentMethodFee: deserializedV2Record.spotFulfillmentMethodFee.val,
		bitFlags: deserializedV2Record.bitFlags,
		takerExistingQuoteEntryAmount:
			deserializedV2Record.takerExistingQuoteEntryAmount?.val,
		takerExistingBaseAssetAmount:
			deserializedV2Record.takerExistingBaseAssetAmount?.val,
		makerExistingQuoteEntryAmount:
			deserializedV2Record.makerExistingQuoteEntryAmount?.val,
		makerExistingBaseAssetAmount:
			deserializedV2Record.makerExistingBaseAssetAmount?.val,
	};

	return transformedRecord;
}

/**
 * Transforms a Data API liquidation record (V2 flattened format) to V1 nested format
 * Used by the all liquidations table which expects nested UISerializableLiquidationRecord
 */
export function transformDataApiLiquidationRecordToUISerializableLiquidationRecord(
	v2Record: JsonObject
): UISerializableLiquidationRecord {
	const deserializedV2Record = Deserialize(
		v2Record,
		UISerializableLiquidationRecordV2
	)!;

	const transformedRecord: UISerializableLiquidationRecord = {
		liquidationId: deserializedV2Record.liquidationId,
		txSig: deserializedV2Record.txSig,
		txSigIndex: deserializedV2Record.txSigIndex,
		slot: deserializedV2Record.slot,
		ts: deserializedV2Record.ts,
		user: deserializedV2Record.user,
		liquidator: deserializedV2Record.liquidator,
		totalCollateral: deserializedV2Record.totalCollateral,
		liquidationType: deserializedV2Record.liquidationType,
		marginRequirement: deserializedV2Record.marginRequirement,
		marginFreed: deserializedV2Record.marginFreed,
		bankrupt: deserializedV2Record.bankrupt,
		bitFlags: deserializedV2Record.bitFlags,
		canceledOrderIds: deserializedV2Record.canceledOrderIds,
		liquidatePerp: {
			marketIndex: deserializedV2Record.liquidatePerp_marketIndex,
			oraclePrice: deserializedV2Record.liquidatePerp_oraclePrice,
			baseAssetAmount: deserializedV2Record.liquidatePerp_baseAssetAmount,
			quoteAssetAmount: deserializedV2Record.liquidatePerp_quoteAssetAmount,
			fillRecordId: deserializedV2Record.liquidatePerp_fillRecordId,
			userOrderId: deserializedV2Record.liquidatePerp_userOrderId,
			liquidatorOrderId: deserializedV2Record.liquidatePerp_liquidatorOrderId,
			liquidatorFee: deserializedV2Record.liquidatePerp_liquidatorFee,
			ifFee: deserializedV2Record.liquidatePerp_ifFee,
			protocolFee: deserializedV2Record.liquidatePerp_protocolFee,
		},
		liquidateSpot: {
			assetMarketIndex: deserializedV2Record.liquidateSpot_assetMarketIndex,
			assetPrice: deserializedV2Record.liquidateSpot_assetPrice,
			assetTransfer: deserializedV2Record.liquidateSpot_assetTransfer,
			liabilityMarketIndex:
				deserializedV2Record.liquidateSpot_liabilityMarketIndex,
			liabilityPrice: deserializedV2Record.liquidateSpot_liabilityPrice,
			liabilityTransfer: deserializedV2Record.liquidateSpot_liabilityTransfer,
			// V2 has ifFee/protocolFee as BigNum, V1 expects BN
			ifFee: deserializedV2Record.liquidateSpot_ifFee?.val,
			protocolFee: deserializedV2Record.liquidateSpot_protocolFee?.val,
		},
		liquidateBorrowForPerpPnl: {
			perpMarketIndex:
				deserializedV2Record.liquidateBorrowForPerpPnl_perpMarketIndex,
			marketOraclePrice:
				deserializedV2Record.liquidateBorrowForPerpPnl_marketOraclePrice,
			pnlTransfer: deserializedV2Record.liquidateBorrowForPerpPnl_pnlTransfer,
			liabilityMarketIndex:
				deserializedV2Record.liquidateBorrowForPerpPnl_liabilityMarketIndex,
			liabilityPrice:
				deserializedV2Record.liquidateBorrowForPerpPnl_liabilityPrice,
			liabilityTransfer:
				deserializedV2Record.liquidateBorrowForPerpPnl_liabilityTransfer,
		},
		liquidatePerpPnlForDeposit: {
			perpMarketIndex:
				deserializedV2Record.liquidatePerpPnlForDeposit_perpMarketIndex,
			marketOraclePrice:
				deserializedV2Record.liquidatePerpPnlForDeposit_marketOraclePrice,
			pnlTransfer: deserializedV2Record.liquidatePerpPnlForDeposit_pnlTransfer,
			assetMarketIndex:
				deserializedV2Record.liquidatePerpPnlForDeposit_assetMarketIndex,
			assetPrice: deserializedV2Record.liquidatePerpPnlForDeposit_assetPrice,
			assetTransfer:
				deserializedV2Record.liquidatePerpPnlForDeposit_assetTransfer,
		},
		// V1 doesn't override perpBankruptcy/spotBankruptcy, so they use BN fields
		perpBankruptcy: {
			marketIndex: deserializedV2Record.perpBankruptcy_marketIndex,
			pnl: deserializedV2Record.perpBankruptcy_pnl?.val,
			ifPayment: deserializedV2Record.perpBankruptcy_ifPayment?.val,
			clawbackUser: deserializedV2Record.perpBankruptcy_clawbackUser,
			clawbackUserPayment:
				deserializedV2Record.perpBankruptcy_clawbackUserPayment?.val,
			cumulativeFundingRateDelta:
				deserializedV2Record.perpBankruptcy_cumulativeFundingRateDelta?.val,
		},
		spotBankruptcy: {
			marketIndex: deserializedV2Record.spotBankruptcy_marketIndex,
			borrowAmount: deserializedV2Record.spotBankruptcy_borrowAmount?.val,
			ifPayment: deserializedV2Record.spotBankruptcy_ifPayment?.val,
			cumulativeDepositInterestDelta:
				deserializedV2Record.spotBankruptcy_cumulativeDepositInterestDelta?.val,
		},
	} as UISerializableLiquidationRecord;

	return transformedRecord;
}

// Serializer
export const Serializer = {
	Serialize: {
		Order: (cls: any) => Serialize(cls, SerializableOrder),
		OrderRecord: (cls: any) => Serialize(cls, SerializableOrderRecord),
		Deposit: (cls: any) => Serialize(cls, SerializableDepositRecord),
		UIDeposit: (cls: any) => Serialize(cls, UISerializableDepositRecord),
		FundingRate: (cls: any) => Serialize(cls, SerializableFundingRateRecord),
		UIFundingRate: (cls: any) =>
			Serialize(cls, UISerializableFundingRateRecord),
		FundingPayment: (cls: any) =>
			Serialize(cls, SerializableFundingPaymentRecord),
		UIFundingPayment: (cls: any) =>
			Serialize(cls, UISerializableFundingPaymentRecord),
		Liquidation: (cls: any) => Serialize(cls, SerializableLiquidationRecord),
		UILiquidation: (cls: any) =>
			Serialize(cls, UISerializableLiquidationRecord),
		UILiquidationV2: (cls: any) =>
			Serialize(cls, UISerializableLiquidationRecordV2),
		SettlePnl: (cls: any) => Serialize(cls, SerializableSettlePnlRecord),
		UISettlePnl: (cls: any) => Serialize(cls, UISerializableSettlePnlRecord),
		UIOrderRecord: (cls: any) => Serialize(cls, UISerializableOrderRecord),
		UIOrderRecordV2: (cls: any) => Serialize(cls, UISerializableOrderRecordV2),
		UIOrderActionRecordV2: (cls: any) =>
			Serialize(cls, UISerializableOrderActionRecordV2),
		SpotInterestRecord: (cls: any) =>
			Serialize(cls, SerializableSpotInterestRecord),
		AmmCurveChanged: (cls: any) => Serialize(cls, SerializableAmmCurveChanged),
		Candle: (cls: any) => Serialize(cls, SerializableCandle),
		UICandle: (cls: any) => Serialize(cls, UISerializableCandle),
		UIOrderActionRecord: (cls: any) =>
			Serialize(cls, UISerializableOrderActionRecord),
		UIMatchedOrderAction: (cls: any) =>
			Serialize(cls, UIMatchedOrderRecordAndAction),
		OrderActionRecord: (cls: any) =>
			Serialize(cls, SerializableOrderActionRecord),
		UserSnapshot: (cls: any) => Serialize(cls, SerializableUserSnapshotRecord),
		UIUserSnapshot: (cls: any) =>
			Serialize(cls, UISerializableUserSnapshotRecord),
		UserSnapshotPerpPositions: (cls: any) =>
			Serialize(cls, SerializableUserPerpPositionSnapshot),
		UserSnapshotSpotPositions: (cls: any) =>
			Serialize(cls, SerializableUserSpotPositionSnapshot),
		LeaderboardResult: (cls: any) =>
			Serialize(cls, SerializableLeaderboardResult),
		AccountSnapshotHistory: (cls: any) =>
			Serialize(cls, SerializableAccountSnapshot),
		NewUser: (cls: any) => Serialize(cls, SerializableNewUserRecord),
		DLOBState: (cls: any) => Serialize(cls, SerializableDLOBState),
		CompetitionResult: (cls: any) => Serialize(cls, CompetitionResult),
		CompetitionResultEntry: (cls: any) =>
			Serialize(cls, CompetitionResultEntry),
		InsuranceFundRecord: (cls: any) =>
			Serialize(cls, SerializableInsuranceFundRecord),
		UIInsuranceFundRecord: (cls: any) =>
			Serialize(cls, UISerializableInsuranceFundRecord),
		InsuranceFundStakeRecord: (cls: any) =>
			Serialize(cls, SerializableInsuranceFundStakeRecord),
		UIInsuranceFundStakeRecord: (cls: any) =>
			Serialize(cls, UISerializableInsuranceFundStakeRecord),
		AllTimePnlData: (cls: any) => Serialize(cls, SerializableAllTimePnlData),
		UIAllTimePnlData: (cls: any) =>
			Serialize(cls, UISerializableAllTimePnlData),
		SwapRecord: (cls: any) => Serialize(cls, SerializableSwapRecord),
		UISwapRecord: (cls: any) => Serialize(cls, UISerializableSwapRecord),
	},
	Deserialize: {
		Order: (cls: JsonObject) => Deserialize(cls, SerializableOrder) as Order,
		OrderRecord: (cls: JsonObject) =>
			// @ts-ignore
			Deserialize(
				cls as JsonObject,
				SerializableOrderRecord
			) as OrderRecordEvent,
		UIOrder: (cls: JsonObject) =>
			Deserialize(cls, UISerializableOrder) as UISerializableOrder,
		UIOrderRecord: (cls: JsonObject) =>
			Deserialize(cls, UISerializableOrderRecord) as UISerializableOrderRecord,
		UIOrderRecordV2: (cls: JsonObject) =>
			Deserialize(
				cls,
				UISerializableOrderRecordV2
			) as UISerializableOrderRecordV2,
		DataApiOrderRecord: (cls: JsonObject) =>
			transformDataApiOrderRecordToSerializableOrderRecord(cls),
		DataApiUIOrderRecord: (cls: JsonObject) =>
			transformDataApiOrderRecordToUISerializableOrderRecord(cls),
		UIOrderActionRecordV2: (cls: JsonObject) =>
			Deserialize(
				cls,
				UISerializableOrderActionRecordV2
			) as UISerializableOrderActionRecordV2,
		DataApiOrderActionRecord: (cls: JsonObject) =>
			transformDataApiOrderActionRecordToSerializableOrderActionRecord(cls),
		DataApiUIOrderActionRecord: (cls: JsonObject) =>
			transformDataApiOrderActionRecordToUISerializableOrderActionRecord(cls),
		DataApiUISerializablePositionHistoryRecord: (cls: JsonObject) =>
			transformDataApiPositionHistoryRecordToUISerializablePositionHistoryRecord(
				cls
			),
		Deposit: (cls: JsonObject) =>
			Deserialize(cls, SerializableDepositRecord) as DepositRecordEvent,
		UIDeposit: (cls: JsonObject) =>
			Deserialize(cls, UISerializableDepositRecord),
		FundingRate: (cls: JsonObject) =>
			Deserialize(cls, SerializableFundingRateRecord) as FundingRateRecordEvent,
		UIFundingRate: (cls: JsonObject) =>
			Deserialize(cls, UISerializableFundingRateRecord),
		FundingPayment: (cls: JsonObject) =>
			Deserialize(
				cls,
				SerializableFundingPaymentRecord
			) as FundingPaymentRecordEvent,
		UIFundingPayment: (cls: JsonObject) =>
			Deserialize(cls, UISerializableFundingPaymentRecord),
		Liquidation: (cls: JsonObject) =>
			Deserialize(cls, SerializableLiquidationRecord) as LiquidationRecordEvent,
		UILiquidation: (cls: JsonObject) =>
			Deserialize(cls, UISerializableLiquidationRecord),
		UILiquidationV2: (cls: JsonObject) =>
			Deserialize(cls, UISerializableLiquidationRecordV2),
		DataApiUILiquidation: (cls: JsonObject) =>
			transformDataApiLiquidationRecordToUISerializableLiquidationRecord(cls),
		SettlePnl: (cls: JsonObject) =>
			Deserialize(cls, SerializableSettlePnlRecord) as SettlePnlRecordEvent,
		SpotInterest: (cls: JsonObject) =>
			Deserialize(
				cls,
				SerializableSpotInterestRecord
			) as SpotInterestRecordEvent,
		AmmCurveChanged: (cls: JsonObject) =>
			Deserialize(
				cls,
				SerializableAmmCurveChanged
			) as SerializableAmmCurveChanged,
		UISettlePnl: (cls: JsonObject) =>
			Deserialize(cls, UISerializableSettlePnlRecord),
		Candle: (cls: JsonObject) => Deserialize(cls, SerializableCandle),
		UICandle: (cls: JsonObject) => Deserialize(cls, UISerializableCandle),
		OrderActionRecord: (cls: JsonObject) =>
			Deserialize(cls, SerializableOrderActionRecord),
		UIOrderActionRecord: (cls: JsonObject) =>
			Deserialize(cls, UISerializableOrderActionRecord),
		UIMatchedOrderAction: (cls: JsonObject) =>
			Deserialize(cls, UIMatchedOrderRecordAndAction),
		UserSnapshot: (cls: JsonObject) =>
			Deserialize(cls, SerializableUserSnapshotRecord),
		UIUserSnapshot: (cls: JsonObject) =>
			// @ts-ignore
			Deserialize(cls, UISerializableUserSnapshotRecord),
		UserSnapshotPerpPositions: (cls: JsonObject) =>
			Deserialize(cls, SerializableUserPerpPositionSnapshot),
		UserSnapshotSpotPositions: (cls: JsonObject) =>
			Deserialize(cls, SerializableUserSpotPositionSnapshot),
		LeaderboardResult: (cls: JsonObject) =>
			Deserialize(cls, SerializableLeaderboardResult),
		UISerializableLeaderboardResult: (cls: JsonObject) =>
			Deserialize(cls, UISerializableLeaderboardResult),
		UIAccountSnapshotHistory: (cls: JsonObject) =>
			Deserialize(cls, UISerializableAccountSnapshot),
		NewUser: (cls: JsonObject) => Deserialize(cls, SerializableNewUserRecord),
		DLOBState: (cls: JsonObject) => Deserialize(cls, SerializableDLOBState),
		CompetitionResult: (cls: JsonObject) => Deserialize(cls, CompetitionResult),
		CompetitionResultEntry: (cls: JsonObject) =>
			Deserialize(cls, CompetitionResultEntry),
		InsuranceFundRecord: (cls: JsonObject) =>
			Deserialize(
				cls,
				SerializableInsuranceFundRecord
			) as InsuranceFundRecordEvent,
		UIInsuranceFundRecord: (cls: JsonObject) =>
			Deserialize(cls, UISerializableInsuranceFundRecord),
		InsuranceFundStakeRecord: (cls: JsonObject) =>
			Deserialize(
				cls,
				SerializableInsuranceFundStakeRecord
			) as InsuranceFundStakeRecordEvent,
		UIInsuranceFundStakeRecord: (cls: JsonObject) =>
			Deserialize(cls, UISerializableInsuranceFundStakeRecord),
		AllTimePnlData: (cls: JsonObject) =>
			Deserialize(cls, SerializableAllTimePnlData),
		UIAllTimePnlData: (cls: JsonObject) =>
			Deserialize(cls, UISerializableAllTimePnlData),
		SwapRecord: (cls: JsonObject) =>
			Deserialize(cls, SerializableSwapRecord) as SwapRecordEvent,
		UISwapRecord: (cls: JsonObject) =>
			Deserialize(cls, UISerializableSwapRecord),
	},
	setDeserializeFromSnakeCase: () => {
		SetDeserializeKeyTransform(SnakeCase);
	},
	setSerializeFromSnakeCase: () => {
		SetSerializeKeyTransform(SnakeCase);
	},
};

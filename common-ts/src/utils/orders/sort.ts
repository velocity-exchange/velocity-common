import {
	Event,
	OrderAction,
	OrderActionRecord,
	OrderRecord,
} from '@velocity-exchange/sdk';
import {
	UIMatchedOrderRecordAndAction,
	UISerializableOrderActionRecord,
} from '../../serializableTypes';
import { matchEnum } from '../enum';

export type PartialOrderActionRecord =
	| PartialUISerializableOrderActionRecord
	| PartialOrderActionEventRecord;

export type PartialUISerializableOrderActionRecord = Pick<
	UISerializableOrderActionRecord,
	| 'quoteAssetAmountFilled'
	| 'baseAssetAmountFilled'
	| 'ts'
	| 'slot'
	| 'action'
	| 'fillRecordId'
	| 'taker'
	| 'takerOrderBaseAssetAmount'
	| 'makerOrderBaseAssetAmount'
	| 'takerOrderCumulativeBaseAssetAmountFilled'
	| 'makerOrderCumulativeBaseAssetAmountFilled'
	| 'takerOrderCumulativeQuoteAssetAmountFilled'
	| 'makerOrderCumulativeQuoteAssetAmountFilled'
	| 'oraclePrice'
>;

export type PartialOrderActionEventRecord = Pick<
	Event<OrderActionRecord>,
	| 'quoteAssetAmountFilled'
	| 'baseAssetAmountFilled'
	| 'ts'
	| 'slot'
	| 'action'
	| 'fillRecordId'
	| 'taker'
	| 'takerOrderBaseAssetAmount'
	| 'makerOrderBaseAssetAmount'
	| 'takerOrderCumulativeBaseAssetAmountFilled'
	| 'makerOrderCumulativeBaseAssetAmountFilled'
	| 'takerOrderCumulativeQuoteAssetAmountFilled'
	| 'makerOrderCumulativeQuoteAssetAmountFilled'
>;

const getChronologicalValueForOrderAction = (action: OrderAction) => {
	return matchEnum(action, OrderAction.PLACE)
		? 0
		: matchEnum(action, OrderAction.FILL)
			? 1
			: 2;
};

/**
 * Returns 1 if the first Order is chronologically later than the second Order, -1 if before, 0 if equal
 * @param orderA
 * @param orderB
 * @returns
 */
export const getSortScoreForOrderRecords = (
	orderA: { slot: number },
	orderB: { slot: number }
) => {
	if (orderA.slot !== orderB.slot) {
		return orderA.slot > orderB.slot ? 1 : -1;
	}

	return 0;
};

/**
 * Returns 1 if the first Order is chronologically later than the second Order, -1 if before, 0 if equal
 * @param orderA
 * @param orderB
 * @returns
 */
export const getSortScoreForOrderActionRecords = (
	orderA: PartialOrderActionRecord,
	orderB: PartialOrderActionRecord
) => {
	if (orderA.slot !== orderB.slot) {
		return orderA.slot > orderB.slot ? 1 : -1;
	}

	if (!matchEnum(orderA.action, orderB.action)) {
		// @ts-ignore
		const orderAActionVal = getChronologicalValueForOrderAction(orderA.action);
		// @ts-ignore
		const orderBActionVal = getChronologicalValueForOrderAction(orderB.action);

		return orderAActionVal > orderBActionVal ? 1 : -1;
	}
	// @ts-ignore
	if (orderA.fillRecordId && orderB.fillRecordId) {
		if (!orderA.fillRecordId.eq(orderB.fillRecordId)) {
			// @ts-ignore
			return orderA.fillRecordId.gt(orderB.fillRecordId) ? 1 : -1;
		}
	}

	return 0;
};

export const sortUIMatchedOrderRecordAndAction = (
	records: UIMatchedOrderRecordAndAction[],
	direction: 'asc' | 'desc' = 'desc'
) => {
	const ascSortedRecords = [...records].sort((a, b) =>
		getSortScoreForOrderActionRecords(a.actionRecord, b.actionRecord)
	);

	return direction === 'desc' ? ascSortedRecords.reverse() : ascSortedRecords;
};

export const sortUIOrderActionRecords = (
	records: PartialUISerializableOrderActionRecord[],
	direction: 'asc' | 'desc' = 'desc'
) => {
	const ascSortedRecords = [...records].sort(getSortScoreForOrderActionRecords);

	return direction === 'desc' ? ascSortedRecords.reverse() : ascSortedRecords;
};

export const sortUIOrderRecords = <T extends { slot: number }>(
	records: T[],
	direction: 'asc' | 'desc' = 'desc'
) => {
	const ascSortedRecords = [...records].sort(getSortScoreForOrderRecords);

	return direction === 'desc' ? ascSortedRecords.reverse() : ascSortedRecords;
};

export const sortOrderRecords = (
	records: Event<OrderRecord>[],
	direction: 'asc' | 'desc' = 'desc'
) => {
	const ascSortedRecords = [...records].sort(getSortScoreForOrderRecords);

	return direction === 'desc' ? ascSortedRecords.reverse() : ascSortedRecords;
};

export const getLatestOfTwoUIOrderRecords = <T extends { slot: number }>(
	orderA: T,
	orderB: T
) => {
	return getSortScoreForOrderRecords(orderA, orderB) === 1 ? orderA : orderB;
};

export const getLatestOfTwoOrderRecords = <T extends { slot: number }>(
	orderA: T,
	orderB: T
) => {
	return getSortScoreForOrderRecords(orderA, orderB) === 1 ? orderA : orderB;
};

export const getUIOrderRecordsLaterThanTarget = <T extends { slot: number }>(
	target: T,
	records: T[]
) =>
	records.filter(
		(record) => getLatestOfTwoUIOrderRecords(record, target) === record
	);

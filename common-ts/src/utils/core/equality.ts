import { ENUM_UTILS } from '../enum';
import { OpenPosition } from '../../types';

export type PropertyType =
	| 'primitive'
	| 'primitiveArray'
	| 'bn'
	| 'bignum'
	| 'programEnum'
	| 'custom';
export type PropertyAndType<KeyOfObject> = [
	property: KeyOfObject,
	type: PropertyType,
	customEqualityFn?: (a: any, b: any) => boolean,
];

const arePropertiesEqual = (
	obj1: any,
	obj2: any,
	properties: PropertyAndType<any>[]
) => {
	return properties.every((property) => {
		const propertyName = property[0];
		const propertyType = property[1];
		const customEqualityFn = property[2];

		switch (propertyType) {
			case 'primitive':
				return obj1[propertyName] === obj2[propertyName];
			case 'primitiveArray':
				return (
					obj1[propertyName]?.length === obj2[propertyName]?.length &&
					obj1[propertyName]?.every((value: any, index: number) => {
						return value === obj2[propertyName]?.[index];
					})
				);
			case 'bn':
			case 'bignum':
				return obj1[propertyName]?.eq(obj2[propertyName]);
			case 'programEnum':
				return ENUM_UTILS.match(obj1[propertyName], obj2[propertyName]);
			case 'custom':
				if (!customEqualityFn)
					throw new Error(
						'You need to provide a custom equality function for this property'
					);

				return customEqualityFn(obj1[propertyName], obj2[propertyName]);
			default:
				throw new Error('Invalid property type');
		}
	});
};

const areTwoOpenPositionsEqual = (
	openPosition1: OpenPosition,
	openPosition2: OpenPosition
) => {
	const propertiesToCompare: PropertyAndType<keyof OpenPosition>[] = [
		['marketIndex', 'primitive'],
		['marketSymbol', 'primitive'],
		['direction', 'primitive'],
		['notional', 'bn'],
		['baseSize', 'bn'],
		['entryPrice', 'bn'],
		['exitPrice', 'bn'],
		['liqPrice', 'bn'],
		['pnlVsOracle', 'bn'],
		['pnlVsMark', 'bn'],
		['quoteAssetNotionalAmount', 'bn'],
		['quoteEntryAmount', 'bn'],
		['unrealizedFundingPnl', 'bn'],
		['lastCumulativeFundingRate', 'bn'],
		['openOrders', 'primitive'],
		['unsettledPnl', 'bn'],
		['unsettledFundingPnl', 'bn'],
		['totalUnrealizedPnl', 'bn'],
		['costBasis', 'bn'],
		['pnlIsClaimable', 'primitive'],
		['realizedPnl', 'bn'],
	];

	return arePropertiesEqual(openPosition1, openPosition2, propertiesToCompare);
};

const areOpenPositionListsEqual = (
	openPositions1: OpenPosition[],
	openPositions2: OpenPosition[]
) => {
	if (openPositions1.length !== openPositions2.length) return false;

	return openPositions1.every((openPosition, index) =>
		areTwoOpenPositionsEqual(openPosition, openPositions2[index])
	);
};

export const EQUALITY_CHECKS = {
	arePropertiesEqual,
	openPosition: areTwoOpenPositionsEqual,
	openPositionLists: areOpenPositionListsEqual,
};

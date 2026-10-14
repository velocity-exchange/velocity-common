import { BigNum } from '@velocity-exchange/sdk';
import { UISerializableOrder } from '../../serializableTypes';

export const getLimitPriceFromOracleOffset = (
	order: UISerializableOrder,
	oraclePrice: BigNum
): BigNum => {
	if (
		(order.price && !order.price.eqZero()) ||
		!order.oraclePriceOffset ||
		order.oraclePriceOffset.eqZero() ||
		!oraclePrice ||
		oraclePrice?.eqZero()
	) {
		return order.price;
	}
	return oraclePrice.add(order.oraclePriceOffset);
};

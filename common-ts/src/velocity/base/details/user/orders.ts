import { Order } from '@velocity-exchange/sdk';
import { Serializer, UISerializableOrder } from '../../../../serializableTypes';

export const getOrderDetails = (order: Order): UISerializableOrder => {
	const serializedOrder = Serializer.Serialize.Order(order)!;
	const deserializedOrder = Serializer.Deserialize.UIOrder(serializedOrder);

	return deserializedOrder;
};

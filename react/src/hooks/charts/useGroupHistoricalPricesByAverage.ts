import { useMemo } from 'react';

import {
	HistoricalPrice,
	HistoricalTokenPriceDuration,
} from '../../constants/charts';

export const useGroupHistoricalPricesByAverage = (
	historicalPrices: HistoricalPrice[],
	duration: HistoricalTokenPriceDuration
) => {
	return useMemo(
		() => groupHistoricalPricesByAverage(historicalPrices, duration),
		[historicalPrices, duration]
	);
};

// trim historical prices by averaging x number of prices
// e.g. if duration is 1 day, then average 3 prices (15 mins interval) into 1 price
// we want to be consistent in the time interval between trimmed prices
// every XX:00, XX:15, XX:30, XX:45 for 1 day
// every 00:00, 02:00, 04:00 etc. for 1 week
// every 00:00, 08:00, 16:00 for 1 month
const groupHistoricalPricesByAverage = (
	prices: HistoricalPrice[],
	duration: HistoricalTokenPriceDuration
): HistoricalPrice[] => {
	if (!prices || prices.length === 0) return [];

	const trimmedPrices: HistoricalPrice[] = [];
	const groupSize =
		duration === HistoricalTokenPriceDuration.ONE_DAY
			? 3 // 15 mins interval
			: duration === HistoricalTokenPriceDuration.ONE_WEEK
				? 2 // 2 hours interval
				: 8; // 8 hours interval

	// if the time of the first price is not at the start of the interval, e.g. XX:05
	// we reduce the group size for the first interval, e.g. average of XX:05, XX:10
	const timeOfFirstPrice = prices[0].ms;
	const date = new Date(timeOfFirstPrice);
	const minutes = date.getMinutes();
	const hours = date.getHours();
	let firstGroupSize = groupSize;

	if (duration === HistoricalTokenPriceDuration.ONE_DAY) {
		if (minutes % 15 !== 0) {
			firstGroupSize = 3 - (minutes % 15) / 5; // 15 mins group, divided by 5 mins interval
		}
	} else if (duration === HistoricalTokenPriceDuration.ONE_WEEK) {
		if (hours % 2 !== 0) {
			firstGroupSize = 1; // group size either 2 or 1
		}
	} else if (duration === HistoricalTokenPriceDuration.ONE_MONTH) {
		if (hours % 8 !== 0) {
			firstGroupSize = 8 - (hours % 8); // 8 hours group
		}
	}

	const firstGroupAveragePrice =
		prices.slice(0, firstGroupSize).reduce((acc, { price }) => acc + price, 0) /
		firstGroupSize;

	// find the average price for each interval
	for (let i = firstGroupSize; i < prices.length; i += groupSize) {
		// dividing by groupSize is "wrong" for the last group if the
		// last group is smaller than groupSize, but we will update
		// the last group's price to the current price later
		const averagePrice =
			prices
				.slice(i, i + groupSize)
				.reduce((acc, { price }) => acc + price, 0) / groupSize;
		// if price is undefined we just skip
		if (!prices[i]) continue;

		trimmedPrices.push({
			ms: prices[i].ms,
			price: averagePrice,
		});
	}

	trimmedPrices.push({
		price: firstGroupAveragePrice,
		// set time to the supposed start of the interval
		ms:
			timeOfFirstPrice -
			(groupSize - firstGroupSize) *
				(duration === HistoricalTokenPriceDuration.ONE_DAY ? 5 : 60) *
				60 *
				1000,
	});

	// price of last group will be the current price
	trimmedPrices[trimmedPrices.length - 1] = prices[prices.length - 1];

	return trimmedPrices;
};

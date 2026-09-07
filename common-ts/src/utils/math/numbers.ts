export const aprFromApy = (apy: number, compoundsPerYear: number) => {
	const compoundedAmount = 1 + apy * 0.01;
	const estimatedApr =
		(Math.pow(compoundedAmount, 1 / compoundsPerYear) - 1) * compoundsPerYear;

	return estimatedApr * 100;
};

export const calculateMean = (numbers: number[]): number => {
	const sum = numbers.reduce((total, num) => total + num, 0);
	return sum / numbers.length;
};

export const calculateMedian = (numbers: number[]): number => {
	const sortedNumbers = [...numbers].sort((a, b) => a - b);
	const middleIndex = Math.floor(sortedNumbers.length / 2);
	if (sortedNumbers.length % 2 === 0) {
		return (sortedNumbers[middleIndex - 1] + sortedNumbers[middleIndex]) / 2;
	} else {
		return sortedNumbers[middleIndex];
	}
};

export const calculateStandardDeviation = (
	numbers: number[],
	mean: number
): number => {
	const squaredDifferences = numbers.map((num) => Math.pow(num - mean, 2));
	const sumSquaredDifferences = squaredDifferences.reduce(
		(total, diff) => total + diff,
		0
	);
	const variance = sumSquaredDifferences / numbers.length;
	return Math.sqrt(variance);
};

/**
 * Returns the number of standard deviations between a target value and the history of values to compare it to.
 */
export const calculateZScore = (
	target: number,
	previousValues: number[]
): number => {
	const meanValue = calculateMean(previousValues);
	const standardDeviationValue = calculateStandardDeviation(
		previousValues,
		meanValue
	);

	const zScore = (target - meanValue) / standardDeviationValue;
	return zScore;
};

export const getPctCompletion = (
	start: number,
	end: number,
	current: number
) => {
	const totalProgressSize = end - start;
	const currentProgressSize = current - start;

	return (currentProgressSize / totalProgressSize) * 100;
};

/**
 * Float helper, and deliberately still one: it rounds a `number` with `Math.round`
 * and is subject to every double fault that implies (ties on negatives go toward
 * +Infinity, and `1.005` at 2dp gives `1`). Fine for a ratio or a chart tick,
 * wrong for anything displayed as money or sent on chain.
 *
 * For exact rounding of BigNum values use `roundBigNumToDecimalPlace`.
 */
export function roundToDecimal(
	value: number,
	decimals: number | undefined | null
) {
	return decimals != null
		? Math.round(value * 10 ** decimals) / 10 ** decimals
		: value;
}

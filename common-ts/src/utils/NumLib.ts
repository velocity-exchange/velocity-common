import {
	BN,
	QUOTE_PRECISION,
	AMM_RESERVE_PRECISION,
	BigNum,
} from '@velocity-exchange/sdk';

/**
 * Utilities to convert numbers and BigNumbers (BN) to different formats for the UI.
 */
export class NumLib {
	/**
	 * Converts a Big Number to its regular number representation.
	 *
	 * This won't work when the precision, or bn/precision is larger than MAX_SAFE_INTEGER .. This shouldn't happen though unless using extremely large numbers
	 * */
	private static toRawNum = (
		bn: BN,
		precision: BN,
		fixedAccuracity?: number
	) => {
		if (!bn) return 0;

		if (bn.lt(precision)) {
			try {
				return bn.toNumber() / precision.toNumber();
			} catch {
				const numScale = new BN(1000);
				return bn.div(precision.div(numScale)).toNumber() / numScale.toNumber();
			}
		}

		let rawValue =
			bn.div(precision).toNumber() +
			bn.mod(precision).toNumber() / precision.toNumber();

		if (fixedAccuracity) {
			rawValue = parseFloat(rawValue.toFixed(fixedAccuracity));
		}

		return rawValue;
	};

	static formatNum = {
		/**
		 * Formats a notional dollar value. Goes to max. 2 decimals (accurate to 1 cent)
		 * @param num
		 * @returns
		 */
		toNotionalNum: (num: number) => {
			return parseFloat((Math.round(num * 100) / 100).toFixed(2));
		},
		/**
		 * This function prints the base amount of an asset with a number of decimals relative to the price of the asset, because for high priced assets we care about more accuracy in the base amount. Number of decimals corresponds to accuracy to ~ 1 cent
		 * @param baseAmount
		 * @param assetPrice in dollars
		 * @param skipLocaleFormatting Format using toFixed rather than localeString, which can't be parsed with regular number parsing
		 * @returns
		 */
		toBase: (baseAmount: number, assetPrice?: number): number => {
			if (assetPrice === 0 || assetPrice === undefined) {
				return parseFloat(baseAmount.toFixed(6));
			}

			const decimalDigits = Math.min(
				Math.max(0, Math.floor(Math.log10(assetPrice))) + 2,
				6
			);

			return parseFloat(baseAmount.toFixed(decimalDigits));
		},
		toBaseBN: (baseAmount: number) =>
			this.formatNum.toRawBn(baseAmount, AMM_RESERVE_PRECISION),
		toQuoteBN: (quoteAmount: number) =>
			this.formatNum.toRawBn(quoteAmount, QUOTE_PRECISION),
		/**
		 * Convert a number to a BN based on the required precision
		 * @param num
		 * @param precision
		 * @returns
		 */
		toRawBn: (num: number, precision: BN) => {
			let numericalAsBn: BN;

			try {
				numericalAsBn = new BN(num * precision.toNumber());
			} catch (e) {
				// Integer part
				if (Math.abs(num) < Number.MAX_SAFE_INTEGER) {
					numericalAsBn = new BN(num).mul(precision);

					// Decimal part
					//// BN Strips the decimal value when constructing one directly. Need to add it manually
					const mantissaSize = Math.log10(precision.toNumber());
					const decimalValue = parseFloat((num % 1).toFixed(mantissaSize));

					numericalAsBn = numericalAsBn.add(
						new BN(decimalValue * 10 ** mantissaSize)
					);
				} else {
					numericalAsBn = new BN(Number.MAX_SAFE_INTEGER).mul(precision);
				}
			}

			return numericalAsBn;
		},
	};

	static formatBn = {
		toRawNum: NumLib.toRawNum,
		fromQuote: (bn: BN) => {
			return NumLib.toRawNum(bn, QUOTE_PRECISION);
		},
		fromBase: (bn: BN) => {
			return NumLib.toRawNum(bn, AMM_RESERVE_PRECISION);
		},
	};

	/**
	 * Get the precision to use for an asset so that base asset amounts are on the same scale as USD cents.
	 *
	 * This is a magnitude exponent read off the raw BN string, which counts the
	 * minus sign as a digit, so a negative price gets one decimal more than the
	 * same positive one. It is not the market precision `marketPrecisionFromSizes`
	 * resolves, and must not be delegated to it.
	 * @param assetPrice
	 * @returns
	 */
	static getDisplayPrecision = (assetPrice: BigNum) => {
		if (!assetPrice || assetPrice.eqZero()) {
			return 6;
		}

		const exponent =
			assetPrice.toString().length - 1 - assetPrice.precision.toNumber();

		if (exponent < 1) return 2;

		return exponent + 2;
	};

	static bp = (num: number) => num * 10 ** -4;

	static isInvalid = (num: number) => !isFinite(num) || typeof num !== 'number';

	static sumBigNums = (nums: BigNum[], precision: BN) => {
		return nums.reduce((previousValue, currentValue) => {
			return previousValue.add(currentValue);
		}, BigNum.zero(precision));
	};

	static averageBigNums = (nums: BigNum[], precision: BN) => {
		if (!nums || !nums.length) return;
		const total = this.sumBigNums(nums, precision);
		return total.scale(1, nums.length);
	};
}

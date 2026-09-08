import {
	BN,
	QUOTE_PRECISION,
	AMM_RESERVE_PRECISION,
	BigNum,
} from '@velocity-exchange/sdk';
import {
	FormatOptions,
	PRESETS,
	formatText,
	formatValue,
} from '../format/index';

/** parseFloat needs the digits ungrouped, and an infinity it can read back. */
const NUMERIC_TEXT: FormatOptions = {
	grouping: false,
	nonFiniteText: { positive: 'Infinity', negative: '-Infinity' },
};

/**
 * Utilities to convert numbers and BigNumbers (BN) to different formats for the UI.
 */
export class NumLib {
	/**
	 * @deprecated The format layer renders en-US only, so a locale set here
	 * moves nothing.
	 */
	static setLocale = (_locale: string) => {};

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
		 * Converts a number to a precision suitable to trade with. Returns a
		 * number, so the replacement parses the rendered text back.
		 *
		 * @deprecated Use `parseFloat(formatText(num, PRESETS.priceText))` from
		 * '@velocity-exchange/common/format'.
		 */
		toTradePrecision: (num: number) =>
			parseFloat(formatText(num, { ...PRESETS.priceText, ...NUMERIC_TEXT })),
		/**
		 * @deprecated Use `formatText(num, PRESETS.tradePrecisionHalfUp)` from
		 * '@velocity-exchange/common/format'.
		 */
		toTradePrecisionString: (num: number, toLocaleString?: boolean) =>
			formatText(
				num,
				toLocaleString
					? { ...PRESETS.tradePrecisionHalfUp, grouping: true }
					: PRESETS.tradePrecisionHalfUp
			),
		/**
		 * Formats a notional dollar value for UI. Goes to max. 2 decimals (accurate to 1 cent).
		 * Rounds the cent, where `BigNum.toNotional` truncates it.
		 *
		 * @deprecated Use `formatText(num, PRESETS.usdHalfUp)` from
		 * '@velocity-exchange/common/format'.
		 */
		toNotionalDisplay: (num: number) => formatText(num, PRESETS.usdHalfUp),
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
		 *
		 * @deprecated Use `formatText(amount, PRESETS.baseAmount)` from
		 * '@velocity-exchange/common/format'.
		 */
		toBaseDisplay: (
			baseAmount: number,
			_assetPrice?: number,
			_skipLocaleFormatting = false,
			customSigFigs = 5
		): string => {
			const options: FormatOptions = {
				...PRESETS.baseAmount,
				grouping: !_skipLocaleFormatting,
			};

			// Below one the shape stops at four decimals whatever digits the caller
			// asked for. The guard reads the magnitude, so a negative amount takes
			// the same digits as the positive one, not the small-amount bound.
			if (Math.abs(baseAmount) >= 1) {
				options.digits = _skipLocaleFormatting
					? {
							kind: 'magnitude',
							assetPrice: _assetPrice ?? 0,
							rounding: 'half-up',
						}
					: {
							kind: 'significant',
							significant: customSigFigs,
							rounding: 'half-up',
							maxDecimals: 4,
						};
			}

			return formatText(baseAmount, options);
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
		 * Formats to price in locale style
		 *
		 * @deprecated Use `formatText(price, PRESETS.displayPrice)` from
		 * '@velocity-exchange/common/format'.
		 */
		toDisplayPrice: (assetPrice: number): string =>
			formatText(assetPrice, PRESETS.displayPrice),
		/**
		 * Rounds a price to six decimals. Converts only; it renders nothing.
		 *
		 * @deprecated Use `formatText(price, { digits: { kind: 'decimals',
		 * decimals: 6, rounding: 'half-up' } })` from
		 * '@velocity-exchange/common/format'.
		 */
		toPrice: (assetPrice: number): number => {
			if (assetPrice === undefined) return 0;

			return parseFloat(
				formatText(assetPrice, {
					...NUMERIC_TEXT,
					digits: { kind: 'decimals', decimals: 6, rounding: 'half-up' },
				})
			);
		},
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
		/**
		 * Rounds a number down to a certain number of decimal places. This differs from .toFixed() in that it rounds down, whereas .toFixed() rounds to the nearest number. Rounds toward negative infinity, so a negative value grows.
		 *
		 * @deprecated Use `formatText(num, { digits: { kind: 'decimals',
		 * decimals, rounding: 'floor' }, grouping: false, trimTrailingZeros:
		 * noPadding })` from '@velocity-exchange/common/format'.
		 */
		toDecimalPlaces: (
			num: number,
			decimalPlaces: number,
			noPadding?: boolean
		): string =>
			formatText(num, {
				digits: {
					kind: 'decimals',
					decimals: decimalPlaces,
					rounding: 'floor',
				},
				grouping: false,
				trimTrailingZeros: noPadding ?? false,
			}),
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
	 * Outputs information and formatted string for UI based on its magnitude
	 *
	 * @deprecated Use `formatValue(value, PRESETS.millifiedAmount)` from
	 * '@velocity-exchange/common/format'.
	 */
	static millify = (
		value: number
	): {
		mantissa: number;
		symbol: string;
		sigFigs: number;
		displayValue: number;
		displayString: string;
	} => {
		const formatted = formatValue(value, PRESETS.millifiedAmount);
		const { parts } = formatted;
		const rendered = `${parts.integer}${parts.fraction}`.replace(/,/g, '');
		const numeric =
			`${parts.sign}${parts.integer}${parts.decimalSeparator}${parts.fraction}`.replace(
				/,/g,
				''
			);

		return {
			mantissa: 10 ** (formatted.abbreviation?.exponent ?? 0),
			symbol: formatted.abbreviation?.unit ?? '',
			sigFigs: Math.max(rendered.replace(/^0+/, '').length, 1),
			// A missing value renders the fallback, which is text rather than digits.
			displayValue: formatted.status === 'ok' ? Number(numeric) : 0,
			displayString: formatted.text,
		};
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

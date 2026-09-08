import {
	AMM_RESERVE_PRECISION_EXP,
	BN,
	BigNum,
	MAX_LEVERAGE_ORDER_SIZE,
} from '@velocity-exchange/sdk';
import { NumLib } from '../../src/utils/NumLib';
import millify from '../../src/utils/millify';
import {
	formatOrderSize,
	isEntirePositionOrder,
} from '../../src/utils/trading';
import { CorpusCase, Divergence, runCorpus } from '../format/divergence';

/**
 * Characterization corpus for the NumLib display members, `formatOrderSize` and
 * the standalone `millify`. Each `legacy*` function below is the implementation
 * as it stood before the delegation, kept here as the oracle: the delegate must
 * reproduce it over the whole corpus except at the cases listed in that
 * member's diff table, and every entry in a diff table names the behaviour it
 * is there for.
 */

const LOCALE = 'en';

// The behaviours the delegates change, named once and pointed at from every
// case that shows one.
const NO_PADDING_BELOW_ONE =
	'a value below one keeps the digits it has, where a significant count used to pad it out';
const NON_FINITE_TEXT =
	'a non-finite or unreadable value renders as a symbol, not as the word NaN or Infinity';
const NULLISH_DASH =
	'a nullish input renders the fallback, where the old code threw or coerced it to zero';
const NULLISH_NAN = 'a nullish input returns NaN instead of throwing';
const EXACT_TIE =
	'an exact decimal tie rounds up, where the double sat just below the tie';
const EXACT_DIGITS =
	'the digits come from the exact decimal, not from a double that cannot hold them';
const EXACT_FLOOR =
	'the floor is exact, where multiplying by a power of ten had already crossed the boundary';
const NO_EXPONENT_FORM =
	'the whole number is rendered, where toPrecision and toString switch to exponential';
const DIGITS_AFTER_ROUNDING =
	'the digit count follows the rounded value, so a carry past one keeps six figures';
const SMALL_DIGIT_CREDIT =
	'below 1e-5 the digit count no longer grows by one per leading zero';
const NEGATIVES_KEEP_DIGITS =
	'a negative amount keeps its digits, where a guard without an abs() sent all of them to the small-amount bound';
const PRICE_MAGNITUDE =
	'the decimals come from the price itself, not from the price plus one, so a price just below a power of ten no longer buys one';
const PRICE_MAGNITUDE_MISSING =
	'a missing or zero price takes six decimals, agreeing with toBase, where the price-plus-one heuristic gave two';
const SIG_FIGS_DECIMAL_CAP =
	'a significant count above five is still capped at four decimals';
const TRAILING_SEPARATOR =
	'at zero decimal places nothing dangles after the separator';
const INVALID_PLACES =
	'a negative or non-integer decimalPlaces throws instead of returning float noise';
const MILLIFY_SIG_FIGS =
	'sigFigs counts the digits actually rendered, where it used to be a fractional log';
const MILLIFY_MANTISSA_ZERO =
	'an unusable value reports a mantissa of one, the identity, rather than zero';
const MILLIFY_TWO_DECIMALS = 'the mantissa always carries two decimals';
const MILLIFY_NEGATIVES =
	'a negative value renders, where the log of a negative left a NaN digit count that threw';
const MILLIFY_NON_FINITE =
	'a non-finite value renders zero, where the NaN digit count threw';
const MILLIFY_UNIT_REDERIVED =
	'the unit is re-derived after rounding, so 999,999.5 reads 1.00M rather than 1,000K';
const MILLIFY_LARGE_UNITS = 'the units continue past T';
const MILLIFY_SMALL_FORM =
	'a value under a cent keeps two significant digits instead of one';

const legacyToTradePrecision = (num: number) => parseFloat(num.toPrecision(6));

// The oracle spells the zero check `===` where the original had `==`; both
// compare a number against zero, so the corpus is unaffected.
const legacyToTradePrecisionString = (
	num: number,
	toLocaleString?: boolean
) => {
	if (num === 0)
		return Number(0).toLocaleString(LOCALE, {
			minimumSignificantDigits: 6,
			maximumSignificantDigits: 6,
		});

	const trimAmount = Math.abs(
		num >= 1 || num === 0
			? 0
			: Math.min(0, Math.floor(Math.log10(Math.abs(num))))
	);

	const sigFigs = Math.max(Math.min(6 - trimAmount, 6), 1);

	const tradePrecisionString = num.toPrecision(sigFigs);

	if (toLocaleString)
		return legacyToTradePrecision(num).toLocaleString(LOCALE, {
			minimumSignificantDigits: sigFigs,
			maximumSignificantDigits: sigFigs,
		});

	return tradePrecisionString;
};

const legacyToNotionalDisplay = (num: number) => {
	return `${num < 0 ? `-` : ``}$${(
		Math.round(Math.abs(num) * 100) / 100
	).toLocaleString(LOCALE, {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	})}`;
};

const legacyToBaseDisplay = (
	baseAmount: number,
	assetPrice?: number,
	skipLocaleFormatting = false,
	customSigFigs = 5
): string => {
	if (baseAmount < 1) {
		if (baseAmount === 0) return '0.0000';

		if (baseAmount < 0.00001) {
			return '<0.00001';
		}

		return baseAmount.toFixed(4);
	}
	if (skipLocaleFormatting) {
		return baseAmount.toFixed(
			Math.min(
				Math.max(0, Math.floor(Math.log10((assetPrice ?? 0) + 1))) + 2,
				6
			)
		);
	}

	return baseAmount.toLocaleString(LOCALE, {
		minimumSignificantDigits: customSigFigs,
		maximumSignificantDigits: customSigFigs,
	});
};

const legacyToDisplayPrice = (assetPrice: number): string => {
	if (assetPrice === undefined) return '';
	if (assetPrice === 0) return assetPrice.toFixed(2);

	return assetPrice.toLocaleString(LOCALE, {
		maximumSignificantDigits: 6,
		minimumSignificantDigits: 6,
	});
};

const legacyToPrice = (assetPrice: number): number => {
	if (assetPrice === undefined) return 0;
	if (assetPrice === 0) return parseFloat(assetPrice.toFixed(2));

	return parseFloat(assetPrice.toFixed(6));
};

const legacyToDecimalPlaces = (
	num: number,
	decimalPlaces: number,
	noPadding?: boolean
): string => {
	const truncatedNum =
		Math.floor(num * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
	if (noPadding) {
		return truncatedNum.toString();
	}

	const paddedNum = truncatedNum.toString();
	const [integerPart, decimalPart = ''] = paddedNum.split('.');
	const paddedDecimal = decimalPart.padEnd(decimalPlaces, '0');
	return `${integerPart}.${paddedDecimal}`;
};

interface MillifyResult {
	mantissa: number;
	symbol: string;
	sigFigs: number;
	displayValue: number;
	displayString: string;
}

const legacyNumLibMillify = (value: number): MillifyResult => {
	if (!value)
		return {
			mantissa: 0,
			symbol: '',
			sigFigs: 1,
			displayValue: 0,
			displayString: '0',
		};

	const valueLog10 = Math.log10(value);

	const metricAmount = Math.floor(valueLog10 / 3);

	const sigFigs = Math.max(3 + (valueLog10 % 3), 1);

	let symbol = '';
	let mantissa = 1;

	switch (metricAmount) {
		case 1:
			mantissa = 10 ** 3;
			symbol = 'K';
			break;
		case 2:
			mantissa = 10 ** 6;
			symbol = 'M';
			break;
		case 3:
			mantissa = 10 ** 9;
			symbol = 'B';
			break;
		case 4:
			mantissa = 10 ** 12;
			symbol = 'T';
			break;
		case 0:
		default:
			mantissa = 1;
			symbol = '';
			break;
	}

	const displayValue = parseFloat(
		(value / mantissa).toLocaleString(LOCALE, {
			maximumSignificantDigits: sigFigs,
		})
	);

	const displayString = `${(value / mantissa).toLocaleString(LOCALE, {
		maximumSignificantDigits: sigFigs,
	})}${symbol}`;

	return { mantissa, symbol, sigFigs, displayValue, displayString };
};

/** Every field, so a change to the object shape shows up as a divergence too. */
const showMillifyResult = (result: MillifyResult) =>
	[
		result.mantissa,
		result.symbol,
		result.sigFigs,
		result.displayValue,
		result.displayString,
	].join('|');

interface MillifyOptions {
	precision?: number;
	decimals?: number;
	notation?: 'scientific' | 'financial';
	trimEndingZeroes?: boolean;
}

const FINANCIAL_UNITS = ['', 'K', 'M', 'B', 'T', 'Q'];
const SCIENTIFIC_UNITS = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];

const legacyMillify = (value: number, options?: MillifyOptions): string => {
	const precision = options?.precision ?? 6;
	const trimEndingZeroes = options?.trimEndingZeroes ?? false;

	if (isNaN(value)) return '0';

	const isNegative = value < 0;
	const absoluteValue = Math.abs(value);

	const units =
		(options?.notation ?? 'financial') === 'financial'
			? FINANCIAL_UNITS
			: SCIENTIFIC_UNITS;

	if (absoluteValue < 1000) {
		const formattedValue = absoluteValue.toPrecision(precision);
		const trimmedValue = trimEndingZeroes
			? parseFloat(formattedValue).toString()
			: formattedValue;
		return `${isNegative ? '-' : ''}${trimmedValue}`;
	}

	const unitIndex = Math.min(
		Math.floor(Math.log10(absoluteValue) / 3),
		units.length - 1
	);

	const scaledValue = absoluteValue / Math.pow(1000, unitIndex);
	const valueWithDecimals =
		options?.decimals !== undefined
			? scaledValue.toFixed(options.decimals)
			: scaledValue.toPrecision(precision);

	const trimmedValue = trimEndingZeroes
		? parseFloat(valueWithDecimals).toString()
		: valueWithDecimals;

	return `${isNegative ? '-' : ''}${trimmedValue}${units[unitIndex]}`;
};

const legacyFormatOrderSize = (
	orderAmount: BigNum,
	formatFn?: (amount: BigNum) => string
): string => {
	if (isEntirePositionOrder(orderAmount)) {
		return 'Entire Position';
	}
	return formatFn ? formatFn(orderAmount) : orderAmount.prettyPrint();
};

// ---------------------------------------------------------------------------
// The shared value corpus
// ---------------------------------------------------------------------------

const VALUES: [string, number][] = [
	['0', 0],
	['-0', -0],
	['0.005', 0.005],
	['-0.005', -0.005],
	['0.05', 0.05],
	['0.285', 0.285],
	['0.2849', 0.2849],
	['0.29', 0.29],
	['-0.29', -0.29],
	['0.0567', 0.0567],
	['0.12345', 0.12345],
	['0.5', 0.5],
	['-0.5', -0.5],
	['0.0000049', 0.0000049],
	['-0.0000049', -0.0000049],
	['0.0000051', 0.0000051],
	['0.00001', 0.00001],
	['1e-7', 1e-7],
	['0.99999', 0.99999],
	['0.999995', 0.999995],
	['0.9999995', 0.9999995],
	['1', 1],
	['-1', -1],
	['1.005', 1.005],
	['1.23456789', 1.23456789],
	['9.999999', 9.999999],
	['9999.995', 9999.995],
	['-9999.995', -9999.995],
	['12345.6789', 12345.6789],
	['1e6', 1e6],
	['999999.5', 999999.5],
	['-999999.5', -999999.5],
	['999999999', 999999999],
	['1e9', 1e9],
	['1e12', 1e12],
	['1e15', 1e15],
	['1e21', 1e21],
	['2^53', 2 ** 53],
	['-2^53', -(2 ** 53)],
	['MAX_VALUE', Number.MAX_VALUE],
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
	['undefined', undefined as unknown as number],
	['null', null as unknown as number],
];

/** The magnitudes worth re-running for every extra parameter. */
const SWEEP_KEYS = [
	'0',
	'0.0567',
	'0.12345',
	'0.5',
	'-0.5',
	'0.0000049',
	'1.23456789',
	'12345.6789',
	'1e6',
	'-9999.995',
	'NaN',
];

const SWEEP_VALUES = VALUES.filter(([key]) => SWEEP_KEYS.includes(key));

// ---------------------------------------------------------------------------
// NumLib.formatNum.toTradePrecision
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toTradePrecision', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => String(legacyToTradePrecision(value)),
		next: () => String(NumLib.formatNum.toTradePrecision(value)),
	}));

	const divergences: Record<string, Divergence> = {
		undefined: {
			behaviour: NULLISH_NAN,
			old: "THROWS: Cannot read properties of undefined (reading 'toPrecision')",
			next: 'NaN',
		},
		null: {
			behaviour: NULLISH_NAN,
			old: "THROWS: Cannot read properties of null (reading 'toPrecision')",
			next: 'NaN',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toTradePrecisionString
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toTradePrecisionString', () => {
	const cases: CorpusCase[] = [];
	for (const [key, value] of VALUES) {
		for (const toLocaleString of [undefined, true]) {
			cases.push({
				key: `${key}${toLocaleString ? ' localised' : ''}`,
				legacy: () => legacyToTradePrecisionString(value, toLocaleString),
				next: () =>
					NumLib.formatNum.toTradePrecisionString(value, toLocaleString),
			});
		}
	}

	const divergences: Record<string, Divergence> = {
		'0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00500',
			next: '0.005',
		},
		'0.005 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00500',
			next: '0.005',
		},
		'-0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00500',
			next: '-0.005',
		},
		'-0.005 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00500',
			next: '-0.005',
		},
		'0.05': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.05000',
			next: '0.05',
		},
		'0.05 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.05000',
			next: '0.05',
		},
		'0.285': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.28500',
			next: '0.285',
		},
		'0.285 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.28500',
			next: '0.285',
		},
		'0.2849': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.28490',
			next: '0.2849',
		},
		'0.2849 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.28490',
			next: '0.2849',
		},
		'0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.29000',
			next: '0.29',
		},
		'0.29 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.29000',
			next: '0.29',
		},
		'-0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.29000',
			next: '-0.29',
		},
		'-0.29 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.29000',
			next: '-0.29',
		},
		'0.0567': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.05670',
			next: '0.0567',
		},
		'0.0567 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.05670',
			next: '0.0567',
		},
		'0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.50000',
			next: '0.5',
		},
		'0.5 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.50000',
			next: '0.5',
		},
		'-0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.50000',
			next: '-0.5',
		},
		'-0.5 localised': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.50000',
			next: '-0.5',
		},
		'0.0000049': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '0.000005',
			next: '0.00000',
		},
		'0.0000049 localised': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '0.000005',
			next: '0.00000',
		},
		'-0.0000049': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '-0.000005',
			next: '-0.00000',
		},
		'-0.0000049 localised': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '-0.000005',
			next: '-0.00000',
		},
		'0.0000051': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '0.000005',
			next: '0.00001',
		},
		'0.0000051 localised': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '0.000005',
			next: '0.00001',
		},
		'1e-7': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '1e-7',
			next: '0.00000',
		},
		'1e-7 localised': {
			behaviour: SMALL_DIGIT_CREDIT,
			old: '0.0000001',
			next: '0.00000',
		},
		'0.999995': {
			behaviour: EXACT_TIE,
			old: '0.99999',
			next: '1.00000',
		},
		'0.999995 localised': {
			behaviour: DIGITS_AFTER_ROUNDING,
			old: '1.0000',
			next: '1.00000',
		},
		'0.9999995': {
			behaviour: DIGITS_AFTER_ROUNDING,
			old: '1.0000',
			next: '1.00000',
		},
		'0.9999995 localised': {
			behaviour: DIGITS_AFTER_ROUNDING,
			old: '1.0000',
			next: '1.00000',
		},
		'1e6': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+6',
			next: '1000000',
		},
		'999999.5': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+6',
			next: '1000000',
		},
		'-999999.5': {
			behaviour: NO_EXPONENT_FORM,
			old: '-1.00000e+6',
			next: '-1000000',
		},
		'999999999': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+9',
			next: '1000000000',
		},
		'1e9': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+9',
			next: '1000000000',
		},
		'1e12': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+12',
			next: '1000000000000',
		},
		'1e15': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+15',
			next: '1000000000000000',
		},
		'1e21': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+21',
			next: '1000000000000000000000',
		},
		'2^53': {
			behaviour: NO_EXPONENT_FORM,
			old: '9.00720e+15',
			next: '9007200000000000',
		},
		'-2^53': {
			behaviour: NO_EXPONENT_FORM,
			old: '-9.00720e+15',
			next: '-9007200000000000',
		},
		MAX_VALUE: {
			behaviour: NO_EXPONENT_FORM,
			old: '1.79769e+308',
			next: '179769000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		},
		NaN: {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN localised': {
			behaviour: NON_FINITE_TEXT,
			old: 'THROWS: minimumSignificantDigits value is out of range.',
			next: '?',
		},
		Infinity: {
			behaviour: NON_FINITE_TEXT,
			old: 'Infinity',
			next: '∞',
		},
		'-Infinity': {
			behaviour: NON_FINITE_TEXT,
			old: '-Infinity',
			next: '-∞',
		},
		undefined: {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of undefined (reading 'toPrecision')",
			next: '-',
		},
		'undefined localised': {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of undefined (reading 'toPrecision')",
			next: '-',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of null (reading 'toPrecision')",
			next: '-',
		},
		'null localised': {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of null (reading 'toPrecision')",
			next: '-',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toNotionalDisplay
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toNotionalDisplay', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => legacyToNotionalDisplay(value),
		next: () => NumLib.formatNum.toNotionalDisplay(value),
	}));

	const divergences: Record<string, Divergence> = {
		'0.285': {
			behaviour: EXACT_TIE,
			old: '$0.28',
			next: '$0.29',
		},
		'1.005': {
			behaviour: EXACT_TIE,
			old: '$1.00',
			next: '$1.01',
		},
		'1e21': {
			behaviour: EXACT_DIGITS,
			old: '$999,999,999,999,999,900,000.00',
			next: '$1,000,000,000,000,000,000,000.00',
		},
		MAX_VALUE: {
			behaviour: EXACT_DIGITS,
			old: '$∞',
			next: '$179,769,313,486,231,570,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000.00',
		},
		NaN: {
			behaviour: NON_FINITE_TEXT,
			old: '$NaN',
			next: '?',
		},
		Infinity: {
			behaviour: NON_FINITE_TEXT,
			old: '$∞',
			next: '∞',
		},
		'-Infinity': {
			behaviour: NON_FINITE_TEXT,
			old: '-$∞',
			next: '-∞',
		},
		undefined: {
			behaviour: NULLISH_DASH,
			old: '$NaN',
			next: '-',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: '$0.00',
			next: '-',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toBaseDisplay
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toBaseDisplay', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => legacyToBaseDisplay(value),
		next: () => NumLib.formatNum.toBaseDisplay(value),
	}));

	const PRICES: [string, number | undefined][] = [
		['no price', undefined],
		['price 0', 0],
		['price 9', 9],
		['price 10', 10],
		['price 1234.56', 1234.56],
	];

	for (const [key, value] of SWEEP_VALUES) {
		for (const [priceKey, price] of PRICES) {
			cases.push({
				key: `${key} raw ${priceKey}`,
				legacy: () => legacyToBaseDisplay(value, price, true),
				next: () => NumLib.formatNum.toBaseDisplay(value, price, true),
			});
		}
		for (const sigFigs of [3, 8]) {
			cases.push({
				key: `${key} @${sigFigs}sf`,
				legacy: () => legacyToBaseDisplay(value, undefined, false, sigFigs),
				next: () =>
					NumLib.formatNum.toBaseDisplay(value, undefined, false, sigFigs),
			});
		}
	}

	const divergences: Record<string, Divergence> = {
		'0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0050',
			next: '0.005',
		},
		'-0.005': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.005',
		},
		'0.05': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0500',
			next: '0.05',
		},
		'0.285': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.2850',
			next: '0.285',
		},
		'0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.2900',
			next: '0.29',
		},
		'-0.29': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.29',
		},
		'0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'-0.5': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.0000049': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '>-0.00001',
		},
		'-1': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-1.0000',
		},
		'-9999.995': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-10,000',
		},
		'-999999.5': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-1,000,000',
		},
		'-2^53': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9,007,200,000,000,000',
		},
		NaN: {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'-Infinity': {
			behaviour: NON_FINITE_TEXT,
			old: '<0.00001',
			next: '-∞',
		},
		undefined: {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of undefined (reading 'toLocaleString')",
			next: '-',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: '<0.00001',
			next: '-',
		},
		'0.5 raw no price': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 raw price 0': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 raw price 9': {
			behaviour: PRICE_MAGNITUDE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 raw price 10': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 raw price 1234.56': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 @3sf': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'0.5 @8sf': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.5000',
			next: '0.5',
		},
		'-0.5 raw no price': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 raw price 0': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 raw price 9': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 raw price 10': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 raw price 1234.56': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 @3sf': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'-0.5 @8sf': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-0.5',
		},
		'1.23456789 raw no price': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '1.23',
			next: '1.234568',
		},
		'1.23456789 raw price 0': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '1.23',
			next: '1.234568',
		},
		'1.23456789 raw price 9': {
			behaviour: PRICE_MAGNITUDE,
			old: '1.235',
			next: '1.23',
		},
		'1.23456789 @8sf': {
			behaviour: SIG_FIGS_DECIMAL_CAP,
			old: '1.2345679',
			next: '1.2346',
		},
		'-9999.995 raw no price': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9999.995000',
		},
		'-9999.995 raw price 0': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9999.995000',
		},
		'-9999.995 raw price 9': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-10000.00',
		},
		'-9999.995 raw price 10': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9999.995',
		},
		'-9999.995 raw price 1234.56': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9999.99500',
		},
		'-9999.995 @3sf': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-10,000',
		},
		'-9999.995 @8sf': {
			behaviour: NEGATIVES_KEEP_DIGITS,
			old: '<0.00001',
			next: '-9,999.9950',
		},
		'12345.6789 raw no price': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '12345.68',
			next: '12345.678900',
		},
		'12345.6789 raw price 0': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '12345.68',
			next: '12345.678900',
		},
		'12345.6789 raw price 9': {
			behaviour: PRICE_MAGNITUDE,
			old: '12345.679',
			next: '12345.68',
		},
		'1e6 raw no price': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '1000000.00',
			next: '1000000.000000',
		},
		'1e6 raw price 0': {
			behaviour: PRICE_MAGNITUDE_MISSING,
			old: '1000000.00',
			next: '1000000.000000',
		},
		'1e6 raw price 9': {
			behaviour: PRICE_MAGNITUDE,
			old: '1000000.000',
			next: '1000000.00',
		},
		'NaN raw no price': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN raw price 0': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN raw price 9': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN raw price 10': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN raw price 1234.56': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN @3sf': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'NaN @8sf': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toDisplayPrice
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toDisplayPrice', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => legacyToDisplayPrice(value),
		next: () => NumLib.formatNum.toDisplayPrice(value),
	}));

	const divergences: Record<string, Divergence> = {
		'0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00500000',
			next: '0.005',
		},
		'-0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00500000',
			next: '-0.005',
		},
		'0.05': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0500000',
			next: '0.05',
		},
		'0.285': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.285000',
			next: '0.285',
		},
		'0.2849': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.284900',
			next: '0.2849',
		},
		'0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.290000',
			next: '0.29',
		},
		'-0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.290000',
			next: '-0.29',
		},
		'0.0567': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0567000',
			next: '0.0567',
		},
		'0.12345': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.123450',
			next: '0.12345',
		},
		'0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.500000',
			next: '0.5',
		},
		'-0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.500000',
			next: '-0.5',
		},
		'0.0000049': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000490000',
			next: '0.0000049',
		},
		'-0.0000049': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00000490000',
			next: '-0.0000049',
		},
		'0.0000051': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000510000',
			next: '0.0000051',
		},
		'0.00001': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0000100000',
			next: '0.00001',
		},
		'1e-7': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.000000100000',
			next: '0.0000001',
		},
		'0.99999': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.999990',
			next: '0.99999',
		},
		NaN: {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		undefined: {
			behaviour: NULLISH_DASH,
			old: '',
			next: '-',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: "THROWS: Cannot read properties of null (reading 'toLocaleString')",
			next: '-',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toPrice
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toPrice', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => String(legacyToPrice(value)),
		next: () => String(NumLib.formatNum.toPrice(value)),
	}));

	const divergences: Record<string, Divergence> = {
		null: {
			behaviour: NULLISH_NAN,
			old: "THROWS: Cannot read properties of null (reading 'toFixed')",
			next: 'NaN',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.formatNum.toDecimalPlaces
// ---------------------------------------------------------------------------

describe('NumLib.formatNum.toDecimalPlaces', () => {
	const cases: CorpusCase[] = [];
	for (const [key, value] of VALUES) {
		for (const noPadding of [false, true]) {
			cases.push({
				key: `${key} @2dp${noPadding ? ' unpadded' : ''}`,
				legacy: () => legacyToDecimalPlaces(value, 2, noPadding),
				next: () => NumLib.formatNum.toDecimalPlaces(value, 2, noPadding),
			});
		}
	}
	for (const [key, value] of SWEEP_VALUES) {
		for (const decimalPlaces of [0, 4, 6]) {
			cases.push({
				key: `${key} @${decimalPlaces}dp`,
				legacy: () => legacyToDecimalPlaces(value, decimalPlaces),
				next: () => NumLib.formatNum.toDecimalPlaces(value, decimalPlaces),
			});
		}
	}
	for (const decimalPlaces of [-1, 1.5]) {
		cases.push({
			key: `1.23456789 @${decimalPlaces}dp`,
			legacy: () => legacyToDecimalPlaces(1.23456789, decimalPlaces),
			next: () => NumLib.formatNum.toDecimalPlaces(1.23456789, decimalPlaces),
		});
	}
	// A value the float multiply lands just under, so the floor takes the
	// neighbour below.
	cases.push({
		key: '1.005 @3dp',
		legacy: () => legacyToDecimalPlaces(1.005, 3),
		next: () => NumLib.formatNum.toDecimalPlaces(1.005, 3),
	});

	const divergences: Record<string, Divergence> = {
		'0.29 @2dp': {
			behaviour: EXACT_FLOOR,
			old: '0.28',
			next: '0.29',
		},
		'0.29 @2dp unpadded': {
			behaviour: EXACT_FLOOR,
			old: '0.28',
			next: '0.29',
		},
		'1e21 @2dp': {
			behaviour: EXACT_DIGITS,
			old: '999999999999999900000.00',
			next: '1000000000000000000000.00',
		},
		'1e21 @2dp unpadded': {
			behaviour: EXACT_DIGITS,
			old: '999999999999999900000',
			next: '1000000000000000000000',
		},
		'MAX_VALUE @2dp': {
			behaviour: EXACT_DIGITS,
			old: 'Infinity.00',
			next: '179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.00',
		},
		'MAX_VALUE @2dp unpadded': {
			behaviour: EXACT_DIGITS,
			old: 'Infinity',
			next: '179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		},
		'NaN @2dp': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN.00',
			next: '?',
		},
		'NaN @2dp unpadded': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN',
			next: '?',
		},
		'Infinity @2dp': {
			behaviour: NON_FINITE_TEXT,
			old: 'Infinity.00',
			next: '∞',
		},
		'Infinity @2dp unpadded': {
			behaviour: NON_FINITE_TEXT,
			old: 'Infinity',
			next: '∞',
		},
		'-Infinity @2dp': {
			behaviour: NON_FINITE_TEXT,
			old: '-Infinity.00',
			next: '-∞',
		},
		'-Infinity @2dp unpadded': {
			behaviour: NON_FINITE_TEXT,
			old: '-Infinity',
			next: '-∞',
		},
		'undefined @2dp': {
			behaviour: NULLISH_DASH,
			old: 'NaN.00',
			next: '-',
		},
		'undefined @2dp unpadded': {
			behaviour: NULLISH_DASH,
			old: 'NaN',
			next: '-',
		},
		'null @2dp': {
			behaviour: NULLISH_DASH,
			old: '0.00',
			next: '-',
		},
		'null @2dp unpadded': {
			behaviour: NULLISH_DASH,
			old: '0',
			next: '-',
		},
		'0 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '0.',
			next: '0',
		},
		'0.0567 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '0.',
			next: '0',
		},
		'0.12345 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '0.',
			next: '0',
		},
		'0.5 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '0.',
			next: '0',
		},
		'-0.5 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '-1.',
			next: '-1',
		},
		'0.0000049 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '0.',
			next: '0',
		},
		'1.23456789 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '1.',
			next: '1',
		},
		'-9999.995 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '-10000.',
			next: '-10000',
		},
		'-9999.995 @4dp': {
			behaviour: EXACT_FLOOR,
			old: '-9999.9951',
			next: '-9999.9950',
		},
		'12345.6789 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '12345.',
			next: '12345',
		},
		'1e6 @0dp': {
			behaviour: TRAILING_SEPARATOR,
			old: '1000000.',
			next: '1000000',
		},
		'NaN @0dp': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN.',
			next: '?',
		},
		'NaN @4dp': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN.0000',
			next: '?',
		},
		'NaN @6dp': {
			behaviour: NON_FINITE_TEXT,
			old: 'NaN.000000',
			next: '?',
		},
		'1.23456789 @-1dp': {
			behaviour: INVALID_PLACES,
			old: '0.',
			next: 'THROWS: decimals must be a non-negative integer, got -1',
		},
		'1.23456789 @1.5dp': {
			behaviour: INVALID_PLACES,
			old: '1.2332882874656679',
			next: 'THROWS: decimals must be a non-negative integer, got 1.5',
		},
		'1.005 @3dp': {
			behaviour: EXACT_FLOOR,
			old: '1.004',
			next: '1.005',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// NumLib.millify
// ---------------------------------------------------------------------------

describe('NumLib.millify', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => showMillifyResult(legacyNumLibMillify(value)),
		next: () => showMillifyResult(NumLib.millify(value)),
	}));

	const divergences: Record<string, Divergence> = {
		'0': {
			behaviour: MILLIFY_MANTISSA_ZERO,
			old: '0||1|0|0',
			next: '1||1|0|0',
		},
		'-0': {
			behaviour: MILLIFY_MANTISSA_ZERO,
			old: '0||1|0|0',
			next: '1||1|0|0',
		},
		'-0.005': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||1|-0.005|-0.005',
		},
		'0.05': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||1.6989700043360187|0.05|0.05',
			next: '1||1|0.05|0.05',
		},
		'0.285': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||2.45484486000851|0.29|0.29',
			next: '1||2|0.29|0.29',
		},
		'0.2849': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||2.454692449239477|0.28|0.28',
			next: '1||2|0.28|0.28',
		},
		'0.29': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||2.462397997898956|0.29|0.29',
			next: '1||2|0.29|0.29',
		},
		'-0.29': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||2|-0.29|-0.29',
		},
		'0.0567': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||1.7535830588929067|0.06|0.06',
			next: '1||1|0.06|0.06',
		},
		'0.12345': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||2.091491094267951|0.12|0.12',
			next: '1||2|0.12|0.12',
		},
		'0.5': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||2.6989700043360187|0.5|0.5',
			next: '1||2|0.5|0.50',
		},
		'-0.5': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||2|-0.5|-0.50',
		},
		'0.0000049': {
			behaviour: MILLIFY_SMALL_FORM,
			old: '1||1|0.000005|0.000005',
			next: '1||2|0.0000049|0.0000049',
		},
		'-0.0000049': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||2|-0.0000049|-0.0000049',
		},
		'0.0000051': {
			behaviour: MILLIFY_SMALL_FORM,
			old: '1||1|0.000005|0.000005',
			next: '1||2|0.0000051|0.0000051',
		},
		'1e-7': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||2|1e-7|0.0000001',
			next: '1||1|1e-7|0.0000001',
		},
		'0.99999': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||2.999995657033466|1|1',
			next: '1||3|1|1.00',
		},
		'0.999995': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||2.9999978285221616|1|1',
			next: '1||3|1|1.00',
		},
		'0.9999995': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||2.9999997828527047|1|1',
			next: '1||3|1|1.00',
		},
		'1': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||3|1|1',
			next: '1||3|1|1.00',
		},
		'-1': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||3|-1|-1.00',
		},
		'1.005': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||3.002166061756508|1.01|1.01',
			next: '1||3|1.01|1.01',
		},
		'1.23456789': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1||3.0915149771692705|1.23|1.23',
			next: '1||3|1.23|1.23',
		},
		'9.999999': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1||3.9999999565705497|10|10',
			next: '1||4|10|10.00',
		},
		'9999.995': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1000|K|3.9999997828527047|10|10K',
			next: '1000|K|4|10|10.00K',
		},
		'-9999.995': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1000|K|4|-10|-10.00K',
		},
		'12345.6789': {
			behaviour: MILLIFY_SIG_FIGS,
			old: '1000|K|4.09151497716927|12.35|12.35K',
			next: '1000|K|4|12.35|12.35K',
		},
		'1e6': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1000000|M|3|1|1M',
			next: '1000000|M|3|1|1.00M',
		},
		'999999.5': {
			behaviour: MILLIFY_UNIT_REDERIVED,
			old: '1000|K|5.999999782852704|1|1,000K',
			next: '1000000|M|3|1|1.00M',
		},
		'-999999.5': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1000000|M|3|-1|-1.00M',
		},
		'999999999': {
			behaviour: MILLIFY_UNIT_REDERIVED,
			old: '1000000|M|5.999999999565706|1|1,000M',
			next: '1000000000|B|3|1|1.00B',
		},
		'1e9': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1000000000|B|3|1|1B',
			next: '1000000000|B|3|1|1.00B',
		},
		'1e12': {
			behaviour: MILLIFY_TWO_DECIMALS,
			old: '1000000000000|T|3|1|1T',
			next: '1000000000000|T|3|1|1.00T',
		},
		'1e15': {
			behaviour: MILLIFY_LARGE_UNITS,
			old: '1||3|1|1,000,000,000,000,000',
			next: '1000000000000000|Q|3|1|1.00Q',
		},
		'1e21': {
			behaviour: MILLIFY_LARGE_UNITS,
			old: '1||3|1|1,000,000,000,000,000,000,000',
			next: '1000000000000000|Q|9|1000000|1,000,000.00Q',
		},
		'2^53': {
			behaviour: MILLIFY_LARGE_UNITS,
			old: '1||3.954589770191003|9|9,010,000,000,000,000',
			next: '1000000000000000|Q|3|9.01|9.01Q',
		},
		'-2^53': {
			behaviour: MILLIFY_NEGATIVES,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1000000000000000|Q|3|-9.01|-9.01Q',
		},
		MAX_VALUE: {
			behaviour: MILLIFY_LARGE_UNITS,
			old: '1||5.254715559916747|179|179,770,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000',
			next: '1000000000000000|Q|296|1.7976931348623157e+293|179,769,313,486,231,570,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000.00Q',
		},
		NaN: {
			behaviour: MILLIFY_MANTISSA_ZERO,
			old: '0||1|0|0',
			next: '1||1|0|0',
		},
		Infinity: {
			behaviour: MILLIFY_NON_FINITE,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||1|0|0',
		},
		'-Infinity': {
			behaviour: MILLIFY_NON_FINITE,
			old: 'THROWS: maximumSignificantDigits value is out of range.',
			next: '1||1|0|0',
		},
		undefined: {
			behaviour: NULLISH_DASH,
			old: '0||1|0|0',
			next: '1||1|0|-',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: '0||1|0|0',
			next: '1||1|0|-',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// the standalone millify
// ---------------------------------------------------------------------------

describe('millify', () => {
	const cases: CorpusCase[] = VALUES.map(([key, value]) => ({
		key,
		legacy: () => legacyMillify(value),
		next: () => millify(value),
	}));

	// The trimmed path handed parseFloat().toString() a value it renders in
	// exponent form.
	cases.push({
		key: '1e-7 trimmed',
		legacy: () => legacyMillify(1e-7, { trimEndingZeroes: true }),
		next: () => millify(1e-7, { trimEndingZeroes: true }),
	});

	const OPTIONS: [string, MillifyOptions][] = [
		['3sf', { precision: 3 }],
		['1dp', { decimals: 1 }],
		['scientific', { notation: 'scientific' }],
		['trimmed', { trimEndingZeroes: true }],
	];

	for (const [key, value] of SWEEP_VALUES) {
		for (const [optionKey, options] of OPTIONS) {
			cases.push({
				key: `${key} ${optionKey}`,
				legacy: () => legacyMillify(value, options),
				next: () => millify(value, options),
			});
		}
	}

	const divergences: Record<string, Divergence> = {
		'0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00500000',
			next: '0.005',
		},
		'-0.005': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00500000',
			next: '-0.005',
		},
		'0.05': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0500000',
			next: '0.05',
		},
		'0.285': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.285000',
			next: '0.285',
		},
		'0.2849': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.284900',
			next: '0.2849',
		},
		'0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.290000',
			next: '0.29',
		},
		'-0.29': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.290000',
			next: '-0.29',
		},
		'0.0567': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0567000',
			next: '0.0567',
		},
		'0.12345': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.123450',
			next: '0.12345',
		},
		'0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.500000',
			next: '0.5',
		},
		'-0.5': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.500000',
			next: '-0.5',
		},
		'0.0000049': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000490000',
			next: '0.0000049',
		},
		'-0.0000049': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.00000490000',
			next: '-0.0000049',
		},
		'0.0000051': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000510000',
			next: '0.0000051',
		},
		'0.00001': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0000100000',
			next: '0.00001',
		},
		'1e-7': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e-7',
			next: '0.0000001',
		},
		'0.99999': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.999990',
			next: '0.99999',
		},
		'999999.5': {
			behaviour: MILLIFY_UNIT_REDERIVED,
			old: '1000.00K',
			next: '1.00000M',
		},
		'-999999.5': {
			behaviour: MILLIFY_UNIT_REDERIVED,
			old: '-1000.00K',
			next: '-1.00000M',
		},
		'999999999': {
			behaviour: MILLIFY_UNIT_REDERIVED,
			old: '1000.00M',
			next: '1.00000B',
		},
		'1e21': {
			behaviour: NO_EXPONENT_FORM,
			old: '1.00000e+6Q',
			next: '1000000Q',
		},
		MAX_VALUE: {
			behaviour: NO_EXPONENT_FORM,
			old: '1.79769e+293Q',
			next: '179769000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000Q',
		},
		Infinity: {
			behaviour: NON_FINITE_TEXT,
			old: 'InfinityQ',
			next: '∞',
		},
		'-Infinity': {
			behaviour: NON_FINITE_TEXT,
			old: '-InfinityQ',
			next: '-∞',
		},
		null: {
			behaviour: NULLISH_DASH,
			old: '0.00000',
			next: '0',
		},
		'1e-7 trimmed': {
			behaviour: NO_EXPONENT_FORM,
			old: '1e-7',
			next: '0.0000001',
		},
		'0.0567 1dp': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0567000',
			next: '0.0567',
		},
		'0.0567 scientific': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.0567000',
			next: '0.0567',
		},
		'0.12345 1dp': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.123450',
			next: '0.12345',
		},
		'0.12345 scientific': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.123450',
			next: '0.12345',
		},
		'0.5 3sf': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.500',
			next: '0.5',
		},
		'0.5 1dp': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.500000',
			next: '0.5',
		},
		'0.5 scientific': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.500000',
			next: '0.5',
		},
		'-0.5 3sf': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.500',
			next: '-0.5',
		},
		'-0.5 1dp': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.500000',
			next: '-0.5',
		},
		'-0.5 scientific': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '-0.500000',
			next: '-0.5',
		},
		'0.0000049 3sf': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000490',
			next: '0.0000049',
		},
		'0.0000049 1dp': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000490000',
			next: '0.0000049',
		},
		'0.0000049 scientific': {
			behaviour: NO_PADDING_BELOW_ONE,
			old: '0.00000490000',
			next: '0.0000049',
		},
	};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

// ---------------------------------------------------------------------------
// formatOrderSize
// ---------------------------------------------------------------------------

describe('formatOrderSize', () => {
	const BASE = AMM_RESERVE_PRECISION_EXP;
	const AMOUNTS: [string, () => BigNum][] = [
		['0', () => BigNum.fromPrint('0', BASE)],
		['1.5', () => BigNum.fromPrint('1.5', BASE)],
		['-1.5', () => BigNum.fromPrint('-1.5', BASE)],
		['1234.5678', () => BigNum.fromPrint('1234.5678', BASE)],
		['0.000000001', () => BigNum.fromPrint('0.000000001', BASE)],
		['1000000', () => BigNum.fromPrint('1000000', BASE)],
		['max leverage', () => new BigNum(MAX_LEVERAGE_ORDER_SIZE, BASE)],
		['truncated max', () => new BigNum(new BN('18446744072000000000'), BASE)],
		[
			'negative max leverage',
			() => new BigNum(MAX_LEVERAGE_ORDER_SIZE.neg(), BASE),
		],
	];

	const cases: CorpusCase[] = [];
	for (const [key, amount] of AMOUNTS) {
		cases.push({
			key,
			legacy: () => legacyFormatOrderSize(amount()),
			next: () => formatOrderSize(amount()),
		});
		cases.push({
			key: `${key} custom`,
			legacy: () => legacyFormatOrderSize(amount(), (a) => a.toFixed(2)),
			next: () => formatOrderSize(amount(), (a) => a.toFixed(2)),
		});
	}

	const divergences: Record<string, Divergence> = {};

	it('agrees with the pre-delegation implementation', () => {
		runCorpus(cases, divergences);
	});
});

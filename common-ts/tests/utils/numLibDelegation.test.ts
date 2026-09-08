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

const legacyToTradePrecision = (num: number) => parseFloat(num.toPrecision(6));

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
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
	['undefined', undefined as unknown as number],
	['null', null as unknown as number],
];

/** The magnitudes worth re-running for every extra parameter. */
const SWEEP_KEYS = [
	'0',
	'0.5',
	'-0.5',
	'0.0000049',
	'1.23456789',
	'12345.6789',
	'1e6',
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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

	const divergences: Record<string, Divergence> = {};

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

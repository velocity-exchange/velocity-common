// The exact-decimal engine lives on ./format/core. Only the types that appear
// in this layer's own signatures are re-exported here.
export {
	BigNumLike,
	BnLike,
	Decimal,
	DecimalStatus,
	NumericInput,
	ParseResult,
	RawWithScale,
	RoundingMode,
	StepMode,
} from './core/index';
export {
	AbbreviateOptions,
	AbbreviateUnits,
	DigitSpec,
	FormatOptions,
	FormatParts,
	FormatResult,
	LegacyNumberType,
	MarketPrecision,
	SentinelRule,
	SignDisplay,
	SmallNumberOptions,
	ValueSign,
} from './types';
export { ENTIRE_POSITION, belowThreshold } from './sentinels';
export { formatText, formatValue } from './formatValue';
export { PRESETS, optionsForLegacyType } from './presets';
export {
	capStringFractionDigits,
	isExactMultiple,
	marketPrecisionFromSizes,
	snapValueToStep,
	stepFractionDigits,
} from './market';
export {
	DigitCaps,
	InputFieldConfig,
	InputFieldKind,
	DIGIT_CAPS,
	inputFieldConfig,
	parseInput,
} from './input';
export { marketPrecisionFromAccount } from './adapters/sdk';

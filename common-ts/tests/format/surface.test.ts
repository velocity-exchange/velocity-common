import { expect } from 'chai';
import * as format from '../../src/format/index';
import * as root from '../../src/index';
import * as mathUtils from '../../src/utils/math';
import * as stringUtils from '../../src/utils/strings';
import * as marketUtils from '../../src/utils/markets';
import * as tradingUtils from '../../src/utils/trading';

/**
 * Every runtime name the ./format subpath publishes. Downstream apps import
 * these, so a name only leaves the list with a migration. Type-only exports
 * erase before this runs and are not pinned here.
 */
const PUBLIC_SURFACE = [
	'DIGIT_CAPS',
	'ENTIRE_POSITION',
	'PRESETS',
	'belowThreshold',
	'capStringFractionDigits',
	'formatText',
	'formatValue',
	'inputFieldConfig',
	'isExactMultiple',
	'marketPrecisionFromAccount',
	'marketPrecisionFromSizes',
	'optionsForLegacyType',
	'parseInput',
	'snapValueToStep',
	'stepFractionDigits',
];

describe('format public surface', () => {
	it('exports exactly the published names', () => {
		expect(Object.keys(format).sort()).to.deep.equal(PUBLIC_SURFACE);
	});
});

/**
 * The number formatting shims removed after Step 7: each of these names must
 * be gone from every subpath that used to carry it, and from the root, which
 * re-exports every utils barrel.
 */
const REMOVED_NAMES = [
	'millify',
	'trimTrailingZeros',
	'getDecimalsFromSize',
	'getBigNumRoundedToStepSize',
	'truncateInputToPrecision',
	'roundToStepSize',
	'roundToStepSizeIfLargeEnough',
	'numbersFitEvenly',
	'formatOrderSize',
	'getSpotMarketSizes',
];

const SUBPATHS: Record<string, object> = {
	'./format': format,
	'.': root,
	'./utils/math': mathUtils,
	'./utils/strings': stringUtils,
	'./utils/markets': marketUtils,
	'./utils/trading': tradingUtils,
};

describe('removed shim names are absent from every subpath', () => {
	for (const [subpath, mod] of Object.entries(SUBPATHS)) {
		for (const name of REMOVED_NAMES) {
			it(`${subpath} does not export ${name}`, () => {
				expect(Object.prototype.hasOwnProperty.call(mod, name)).to.equal(false);
			});
		}
	}
});

describe('NumLib no longer carries the deprecated display members', () => {
	it('has no setLocale or millify', () => {
		const numLib = root.NumLib as unknown as Record<string, unknown>;
		expect(numLib.setLocale).to.equal(undefined);
		expect(numLib.millify).to.equal(undefined);
	});

	it('formatNum has no deprecated members', () => {
		const removed = [
			'toTradePrecision',
			'toTradePrecisionString',
			'toNotionalDisplay',
			'toBaseDisplay',
			'toDisplayPrice',
			'toPrice',
			'toDecimalPlaces',
		];
		const formatNum = root.NumLib.formatNum as Record<string, unknown>;
		for (const name of removed) {
			expect(formatNum[name], name).to.equal(undefined);
		}
	});
});

describe('PRESETS.usdHalfUp is removed', () => {
	it('is absent from PRESETS', () => {
		expect((format.PRESETS as Record<string, unknown>).usdHalfUp).to.equal(
			undefined
		);
	});
});

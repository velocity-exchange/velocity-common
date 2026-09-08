import { expect } from 'chai';
import * as format from '../../src/format/index';

/**
 * Every runtime name the ./format subpath publishes. Downstream apps import
 * these, so a name only leaves the list with a migration.
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

	it('exports 15 runtime names', () => {
		expect(Object.keys(format)).to.have.lengthOf(PUBLIC_SURFACE.length);
		expect(PUBLIC_SURFACE).to.have.lengthOf(15);
	});
});

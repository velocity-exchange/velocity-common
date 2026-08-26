import { trimTrailingZeros } from '../../src/utils/strings/format';
import {
	abbreviateAddress,
	abbreviateAccountName,
} from '../../src/utils/strings';
import { expect } from 'chai';
describe('trimTrailingZeros', () => {
	it('trims trailing zeros after decimal', () => {
		expect(trimTrailingZeros('1.0000')).to.equal('1.0'); // default is leave 1 zero
		expect(trimTrailingZeros('1.0000', 0)).to.equal('1');
		expect(trimTrailingZeros('1.1000', 0)).to.equal('1.1');
		expect(trimTrailingZeros('1.1200', 0)).to.equal('1.12');
		expect(trimTrailingZeros('1.0010', 0)).to.equal('1.001');
	});

	it('handles numbers without trailing zeros', () => {
		expect(trimTrailingZeros('1', 0)).to.equal('1');
		expect(trimTrailingZeros('1.1', 0)).to.equal('1.1');
		expect(trimTrailingZeros('1.123', 0)).to.equal('1.123');
	});

	it('handles zero', () => {
		expect(trimTrailingZeros('0', 0)).to.equal('0');
		expect(trimTrailingZeros('0.0', 0)).to.equal('0');
		expect(trimTrailingZeros('0.000', 0)).to.equal('0');
	});
});

describe('abbreviateAddress', () => {
	it('returns start and end slices with unicode ellipsis', () => {
		const addr = 'ABCDEFGH1234567890';
		expect(abbreviateAddress(addr, 4)).to.equal('ABCD\u20267890');
	});
});

describe('abbreviateAccountName', () => {
	it('truncates with trailing ellipsis', () => {
		expect(abbreviateAccountName('VelocityUserAccount', 8)).to.equal(
			'Velocity...'
		);
	});

	it('supports middle ellipsis mode', () => {
		expect(
			abbreviateAccountName('VelocityUserAccount', 8, {
				ellipsisMiddle: true,
			})
		).to.equal('Velo...ount');
	});

	it('returns name unchanged when shorter than size', () => {
		expect(abbreviateAccountName('Short', 8)).to.equal('Short');
	});
});

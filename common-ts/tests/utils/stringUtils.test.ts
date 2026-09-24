import {
	abbreviateAddress,
	abbreviateAccountName,
} from '../../src/utils/strings';
import { expect } from 'chai';

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

import { BN, BigNum } from '@velocity-exchange/sdk';
import { expect } from 'chai';
import { PRESETS, formatText, formatValue } from '../../src/format/index';

const MARKERS = {
	u64Max: '18446744073709551615',
	truncated: '18446744072000000000',
};

const U64_MAX = BigInt(MARKERS.u64Max);
const below = (n: string) => (U64_MAX - BigInt(n)).toString();

// [label, raw units, scale, matches]
const RAW_CASES: [string, string, number, boolean][] = [
	['u64::MAX at scale 0', MARKERS.u64Max, 0, true],
	['u64::MAX at scale 9', MARKERS.u64Max, 9, true],
	['u64::MAX at scale 25', MARKERS.u64Max, 25, true],
	['truncated marker at scale 6', MARKERS.truncated, 6, true],
	['step 1e10 at scale 9', below('3709551615'), 9, true],
	['just inside the window', below('999999999999'), 9, true],
	['at the window edge', below('1000000000000'), 9, false],
	['one above u64::MAX', (U64_MAX + BigInt(1)).toString(), 9, false],
	['18 tokens at 18 decimals', '18000000000000000000', 18, false],
	['1 raw unit at scale 25', '1', 25, false],
	['ordinary size at scale 9', '1234500000', 9, false],
	['zero', '0', 9, false],
];

describe('ENTIRE_POSITION matches a fixed raw window below u64::MAX', () => {
	for (const [label, units, scale, expected] of RAW_CASES) {
		it(`${label}: ${expected ? 'matches' : 'does not match'}`, () => {
			const input = { raw: { toString: () => units }, scale };
			expect(formatValue(input, PRESETS.orderSize).isSentinel).to.equal(
				expected
			);
		});
	}

	it('long fractions print as numbers', () => {
		for (const v of [
			0.00012345678901234567,
			'1.2345678901234567890',
			'0.5000000000000000000001',
		]) {
			expect(formatValue(v, PRESETS.orderSize).isSentinel, String(v)).to.equal(
				false
			);
		}
	});

	it('renders the marker text only for the positive amount', () => {
		const amount = (sign: 1 | -1) =>
			new BigNum(new BN(MARKERS.u64Max).muln(sign), new BN(9));
		expect(formatText(amount(1), PRESETS.orderSize)).to.equal(
			'Entire Position'
		);
		expect(formatText(amount(-1), PRESETS.orderSize)).to.equal(
			'-18,446,744,073.709551615'
		);
	});
});

describe('ENTIRE_POSITION recognises the step-rounded u64::MAX', () => {
	// standardize_base_asset_amount(u64::MAX, step) floors u64::MAX to a
	// multiple of the market step, at BASE precision (9 decimals).
	const rounded = (step: bigint) => {
		const max = BigInt(MARKERS.u64Max);
		return ((max / step) * step).toString();
	};

	const cases: [string, bigint][] = [
		['1e6', BigInt(1_000_000)],
		['1e7', BigInt(10_000_000)],
		['1e9', BigInt(1_000_000_000)],
		['1e10', BigInt(10_000_000_000)],
	];

	for (const [label, step] of cases) {
		it(`step ${label}: orderSize and orderSizeStep both read Entire Position`, () => {
			const input = { raw: { toString: () => rounded(step) }, scale: 9 };
			expect(formatText(input, PRESETS.orderSize)).to.equal('Entire Position');
			expect(formatText(input, PRESETS.orderSizeStep)).to.equal(
				'Entire Position'
			);
		});
	}

	it('the two exact marker values still match', () => {
		for (const units of Object.values(MARKERS)) {
			const input = { raw: { toString: () => units }, scale: 9 };
			expect(formatText(input, PRESETS.orderSize)).to.equal('Entire Position');
		}
	});

	it('a negative amount with the same units never matches', () => {
		const input = {
			raw: { toString: () => `-${MARKERS.u64Max}` },
			scale: 9,
		};
		expect(formatValue(input, PRESETS.orderSize).isSentinel).to.equal(false);
	});
});

import {
	FormatOptions,
	PRESETS,
	formatText,
	optionsForLegacyType,
} from '../../src/format/index';
import { expect } from 'chai';
import { CorpusCase, Divergence, runCorpus } from './divergence';

/**
 * `usd` flips from truncate to half-up at the cent. OLD_USD is frozen here,
 * copying the pre-flip shape, so the corpus keeps its meaning once
 * `PRESETS.usd` changes underneath it.
 */
const OLD_USD: FormatOptions = Object.freeze({
	style: 'currency' as const,
	digits: Object.freeze({
		kind: 'decimals' as const,
		decimals: 2,
		rounding: 'truncate' as const,
	}),
});
const OLD_USD_SIGNED: FormatOptions = Object.freeze({
	...OLD_USD,
	signDisplay: 'exceptZero' as const,
});
const OLD_USD_COMPACT: FormatOptions = Object.freeze({
	...OLD_USD,
	abbreviate: Object.freeze({ threshold: '10000' }),
});

const CLASS_1 =
	'1: a positive value with a dropped third digit of 5 or more rounds up';
const CLASS_2 = '2: negatives round away from zero at 5 or more';
const CLASS_3 =
	'3: -0.005 up to just under -0.01 rounds to -$0.01, anything smaller stays -$0.00';
const CLASS_4 = '4: a positive tie at the cent rounds up to the next cent';
const CLASS_5 =
	'5: a carry from the rounded cent grows the text, including past a thousands separator';
const CLASS_6 =
	'6: usdSigned/pnl print the rounded penny where they used to print a signed $0.00';
const CLASS_7 =
	'7: usdCompact checks its threshold against the raw value, so a carry past 10,000 prints in full instead of abbreviating';

interface Case {
	key: string;
	oldUsd: string;
	newUsd: string;
	oldSigned: string;
	newSigned: string;
	/** Divergence class for the unsigned (usd-shaped) channels. */
	class?: string;
	/** Divergence class for the signed (usdSigned/pnl-shaped) channels, when it differs. */
	signedClass?: string;
}

// Every row's strings are asserted literally, and a row with no class is also
// asserted unchanged, so the table records which magnitudes the flip leaves alone.
const CASES: Case[] = [
	{
		key: '0',
		oldUsd: '$0.00',
		newUsd: '$0.00',
		oldSigned: '$0.00',
		newSigned: '$0.00',
	},
	{
		key: '-0',
		oldUsd: '$0.00',
		newUsd: '$0.00',
		oldSigned: '$0.00',
		newSigned: '$0.00',
	},
	{
		key: '0.001',
		oldUsd: '$0.00',
		newUsd: '$0.00',
		oldSigned: '+$0.00',
		newSigned: '+$0.00',
	},
	{
		key: '-0.001',
		oldUsd: '-$0.00',
		newUsd: '-$0.00',
		oldSigned: '-$0.00',
		newSigned: '-$0.00',
	},
	{
		key: '0.004',
		oldUsd: '$0.00',
		newUsd: '$0.00',
		oldSigned: '+$0.00',
		newSigned: '+$0.00',
	},
	{
		key: '-0.004',
		oldUsd: '-$0.00',
		newUsd: '-$0.00',
		oldSigned: '-$0.00',
		newSigned: '-$0.00',
	},
	{
		key: '0.005',
		oldUsd: '$0.00',
		newUsd: '$0.01',
		oldSigned: '+$0.00',
		newSigned: '+$0.01',
		class: CLASS_4,
		signedClass: CLASS_6,
	},
	{
		key: '-0.005',
		oldUsd: '-$0.00',
		newUsd: '-$0.01',
		oldSigned: '-$0.00',
		newSigned: '-$0.01',
		class: CLASS_3,
	},
	{
		key: '0.00499',
		oldUsd: '$0.00',
		newUsd: '$0.00',
		oldSigned: '+$0.00',
		newSigned: '+$0.00',
	},
	{
		key: '-0.00499',
		oldUsd: '-$0.00',
		newUsd: '-$0.00',
		oldSigned: '-$0.00',
		newSigned: '-$0.00',
	},
	{
		key: '0.00999',
		oldUsd: '$0.00',
		newUsd: '$0.01',
		oldSigned: '+$0.00',
		newSigned: '+$0.01',
		class: CLASS_1,
		signedClass: CLASS_6,
	},
	{
		key: '-0.00999',
		oldUsd: '-$0.00',
		newUsd: '-$0.01',
		oldSigned: '-$0.00',
		newSigned: '-$0.01',
		class: CLASS_3,
	},
	{
		key: '123.456',
		oldUsd: '$123.45',
		newUsd: '$123.46',
		oldSigned: '+$123.45',
		newSigned: '+$123.46',
		class: CLASS_1,
	},
	{
		key: '-123.456',
		oldUsd: '-$123.45',
		newUsd: '-$123.46',
		oldSigned: '-$123.45',
		newSigned: '-$123.46',
		class: CLASS_2,
	},
	{
		key: '1.235',
		oldUsd: '$1.23',
		newUsd: '$1.24',
		oldSigned: '+$1.23',
		newSigned: '+$1.24',
		class: CLASS_1,
	},
	{
		key: '-1.235',
		oldUsd: '-$1.23',
		newUsd: '-$1.24',
		oldSigned: '-$1.23',
		newSigned: '-$1.24',
		class: CLASS_2,
	},
	{
		key: '9.995',
		oldUsd: '$9.99',
		newUsd: '$10.00',
		oldSigned: '+$9.99',
		newSigned: '+$10.00',
		class: CLASS_5,
	},
	{
		key: '-9.995',
		oldUsd: '-$9.99',
		newUsd: '-$10.00',
		oldSigned: '-$9.99',
		newSigned: '-$10.00',
		class: CLASS_5,
	},
	{
		key: '999.995',
		oldUsd: '$999.99',
		newUsd: '$1,000.00',
		oldSigned: '+$999.99',
		newSigned: '+$1,000.00',
		class: CLASS_5,
	},
	{
		key: '-999.995',
		oldUsd: '-$999.99',
		newUsd: '-$1,000.00',
		oldSigned: '-$999.99',
		newSigned: '-$1,000.00',
		class: CLASS_5,
	},
	{
		key: '9999.995',
		oldUsd: '$9,999.99',
		newUsd: '$10,000.00',
		oldSigned: '+$9,999.99',
		newSigned: '+$10,000.00',
		class: CLASS_5,
	},
	{
		key: '-9999.995',
		oldUsd: '-$9,999.99',
		newUsd: '-$10,000.00',
		oldSigned: '-$9,999.99',
		newSigned: '-$10,000.00',
		class: CLASS_5,
	},
	{
		key: '10000.005',
		oldUsd: '$10,000.00',
		newUsd: '$10,000.01',
		oldSigned: '+$10,000.00',
		newSigned: '+$10,000.01',
		class: CLASS_4,
	},
	{
		key: '1234567.895',
		oldUsd: '$1,234,567.89',
		newUsd: '$1,234,567.90',
		oldSigned: '+$1,234,567.89',
		newSigned: '+$1,234,567.90',
		class: CLASS_1,
	},
	{
		key: '100.20',
		oldUsd: '$100.20',
		newUsd: '$100.20',
		oldSigned: '+$100.20',
		newSigned: '+$100.20',
	},
	{
		key: '2.50',
		oldUsd: '$2.50',
		newUsd: '$2.50',
		oldSigned: '+$2.50',
		newSigned: '+$2.50',
	},
	{
		key: '9999',
		oldUsd: '$9,999.00',
		newUsd: '$9,999.00',
		oldSigned: '+$9,999.00',
		newSigned: '+$9,999.00',
	},
	{
		key: '4582930',
		oldUsd: '$4,582,930.00',
		newUsd: '$4,582,930.00',
		oldSigned: '+$4,582,930.00',
		newSigned: '+$4,582,930.00',
	},
];

function unsignedCorpus(next: (v: string) => string) {
	const cases: CorpusCase[] = CASES.map((c) => ({
		key: c.key,
		legacy: () => formatText(c.key, OLD_USD),
		next: () => next(c.key),
	}));
	const divergences: Record<string, Divergence> = {};
	for (const c of CASES) {
		if (c.class) {
			divergences[c.key] = {
				behaviour: c.class,
				old: c.oldUsd,
				next: c.newUsd,
			};
		}
	}
	return { cases, divergences };
}

function signedCorpus(next: (v: string) => string) {
	const cases: CorpusCase[] = CASES.map((c) => ({
		key: c.key,
		legacy: () => formatText(c.key, OLD_USD_SIGNED),
		next: () => next(c.key),
	}));
	const divergences: Record<string, Divergence> = {};
	for (const c of CASES) {
		const behaviour = c.signedClass ?? c.class;
		if (behaviour) {
			divergences[c.key] = { behaviour, old: c.oldSigned, next: c.newSigned };
		}
	}
	return { cases, divergences };
}

interface CompactCase {
	key: string;
	old: string;
	next: string;
	class?: string;
}

const COMPACT_CASES: CompactCase[] = [
	{ key: '0', old: '$0.00', next: '$0.00' },
	{ key: '0.005', old: '$0.00', next: '$0.01', class: CLASS_4 },
	{ key: '-0.005', old: '-$0.00', next: '-$0.01', class: CLASS_3 },
	{ key: '123.456', old: '$123.45', next: '$123.46', class: CLASS_1 },
	{ key: '-1.235', old: '-$1.23', next: '-$1.24', class: CLASS_2 },
	{ key: '9.995', old: '$9.99', next: '$10.00', class: CLASS_5 },
	{ key: '999.995', old: '$999.99', next: '$1,000.00', class: CLASS_5 },
	{ key: '9999.995', old: '$9,999.99', next: '$10,000.00', class: CLASS_7 },
	{ key: '-9999.995', old: '-$9,999.99', next: '-$10,000.00', class: CLASS_7 },
	// Already abbreviated on the raw value, so the flip changes nothing here.
	{ key: '10000.005', old: '$10.0K', next: '$10.0K' },
	{ key: '1234567.895', old: '$1.23M', next: '$1.23M' },
	// Abbreviated digits still truncate: only the full-number path flipped.
	{ key: '1235000', old: '$1.23M', next: '$1.23M' },
	{ key: '9999', old: '$9,999.00', next: '$9,999.00' },
	{ key: '4582930', old: '$4.58M', next: '$4.58M' },
	{ key: '100.20', old: '$100.20', next: '$100.20' },
	{ key: '2.50', old: '$2.50', next: '$2.50' },
];

function compactCorpus() {
	const cases: CorpusCase[] = COMPACT_CASES.map((c) => ({
		key: c.key,
		legacy: () => formatText(c.key, OLD_USD_COMPACT),
		next: () => formatText(c.key, PRESETS.usdCompact),
	}));
	const divergences: Record<string, Divergence> = {};
	for (const c of COMPACT_CASES) {
		if (c.class) {
			divergences[c.key] = { behaviour: c.class, old: c.old, next: c.next };
		}
	}
	return { cases, divergences };
}

describe('format/usdFlip', () => {
	it('prints every documented string, old and new', () => {
		for (const c of CASES) {
			expect(formatText(c.key, OLD_USD), c.key).to.equal(c.oldUsd);
			expect(formatText(c.key, PRESETS.usd), c.key).to.equal(c.newUsd);
			expect(formatText(c.key, OLD_USD_SIGNED), c.key).to.equal(c.oldSigned);
			expect(formatText(c.key, PRESETS.usdSigned), c.key).to.equal(c.newSigned);
		}
		for (const c of COMPACT_CASES) {
			expect(formatText(c.key, OLD_USD_COMPACT), c.key).to.equal(c.old);
			expect(formatText(c.key, PRESETS.usdCompact), c.key).to.equal(c.next);
		}
	});

	it('usd rounds half-up at the cent', () => {
		const { cases, divergences } = unsignedCorpus((v) =>
			formatText(v, PRESETS.usd)
		);
		runCorpus(cases, divergences);
	});

	it('usdSigned rounds half-up at the cent', () => {
		const { cases, divergences } = signedCorpus((v) =>
			formatText(v, PRESETS.usdSigned)
		);
		runCorpus(cases, divergences);
	});

	it('pnl rounds half-up at the cent', () => {
		const { cases, divergences } = signedCorpus((v) =>
			formatText(v, PRESETS.pnl)
		);
		runCorpus(cases, divergences);
	});

	it('usdCompact rounds half-up below its abbreviation threshold', () => {
		const { cases, divergences } = compactCorpus();
		runCorpus(cases, divergences);
	});

	it("optionsForLegacyType('currency') delegates to the flipped usd", () => {
		const { cases, divergences } = unsignedCorpus((v) =>
			formatText(v, optionsForLegacyType('currency'))
		);
		runCorpus(cases, divergences);
	});

	it("optionsForLegacyType('currency_signed') delegates to the flipped usdSigned", () => {
		const { cases, divergences } = signedCorpus((v) =>
			formatText(v, optionsForLegacyType('currency_signed'))
		);
		runCorpus(cases, divergences);
	});
});

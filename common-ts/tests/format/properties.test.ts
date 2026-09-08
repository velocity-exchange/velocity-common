import { expect } from 'chai';
import {
	PRESETS,
	capStringFractionDigits,
	formatText,
	parseInput,
	snapValueToStep,
} from '../../src/format/index';
import {
	Decimal,
	abs,
	capFractionDigits,
	compare,
	fromParts,
	fromString,
	isStepMultiple,
	rescale,
	toDecimal,
	toPlainString,
} from '../../src/format/core/index';
import { makeRandom } from './random';

// Each test draws from its own generator, so one test cannot shift the corpus
// another one sees.
const SEED = 20260827;
const CASES = 400;

type Random = () => number;

function randomDecimal(random: Random): Decimal {
	const digitCount = 1 + Math.floor(random() * 24);
	let digits = String(1 + Math.floor(random() * 9));
	for (let i = 1; i < digitCount; i++) {
		digits += String(Math.floor(random() * 10));
	}
	const scale = Math.floor(random() * 20);
	const sign = random() < 0.5 ? -1 : 1;
	if (random() < 0.05) return fromParts(0, '0', scale);
	return fromParts(sign, digits, scale);
}

function randomStep(random: Random): Decimal {
	const scale = Math.floor(random() * 10);
	const lead = 1 + Math.floor(random() * 9);
	const trailing = Math.floor(random() * 3);
	return fromParts(1, `${lead}${'0'.repeat(trailing)}`, scale);
}

/** Signed integer units at a common scale, so two Decimals subtract exactly. */
function unitsAt(d: Decimal, scale: number): bigint {
	const at = rescale(d, scale);
	const magnitude = BigInt(at.digits);
	return at.sign === -1 ? -magnitude : magnitude;
}

const CORPUS = [
	'0',
	'-0.001',
	'0.5',
	'1.5',
	'2.5',
	'123.456789',
	'-123.456789',
	'1000000000000000',
	'1000000000000000000',
	'1000000000000000000000',
	'18446744073709551615',
	'0.000000295',
	'0.0001',
	'0.00001',
	'1234.5',
	'-1234.5',
	'9999.99',
	'0.00000000000000000001',
];

describe('format properties: parse and render round-trip', () => {
	it('toDecimal(toPlainString(x)) reproduces x exactly', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const round = toDecimal(toPlainString(value));
			expect(round.status, toPlainString(value)).to.equal('ok');
			expect(round.value, toPlainString(value)).to.deep.equal(value);
		}
	});

	it('fromString(toPlainString(x)) reproduces x for every fixture', () => {
		for (const raw of CORPUS) {
			const value = toDecimal(raw).value!;
			const text = toPlainString(value);
			expect(fromString(text).value, raw).to.deep.equal(value);
		}
	});

	// `plain` is exact digits with grouping off, so its text is exactly what
	// toPlainString emits and nothing is lost on the way back in.
	it('fromString(formatText(x, PRESETS.plain)) reproduces x', () => {
		const random = makeRandom(SEED);
		for (const raw of CORPUS) {
			const value = toDecimal(raw).value!;
			const text = formatText(value, PRESETS.plain);
			expect(text, raw).to.equal(toPlainString(value));
			expect(fromString(text).value, raw).to.deep.equal(value);
		}
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const text = formatText(value, PRESETS.plain);
			expect(fromString(text).value, text).to.deep.equal(value);
		}
	});
});

describe('format properties: input round-trip', () => {
	it('parseInput(toPlainString(x)) reproduces x at its own scale', () => {
		const random = makeRandom(SEED);
		for (const raw of CORPUS) {
			const value = toDecimal(raw).value!;
			const back = parseInput(toPlainString(value), value.scale);
			expect(back.status, raw).to.equal('ok');
			expect(back.value, raw).to.deep.equal(value);
		}
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const text = toPlainString(value);
			const back = parseInput(text, value.scale);
			expect(back.status, text).to.equal('ok');
			expect(back.value, text).to.deep.equal(value);
		}
	});

	it('parseInput reads a grouped render back exactly', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const text = formatText(value, {
				digits: { kind: 'exact' },
				grouping: true,
			});
			const back = parseInput(text, value.scale);
			expect(back.status, text).to.equal('ok');
			expect(back.value, text).to.deep.equal(value);
		}
	});
});

describe('format properties: fraction caps', () => {
	it('capFractionDigits is idempotent and never grows a value', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const max = Math.floor(random() * 12);
			const once = capFractionDigits(value, max);
			expect(capFractionDigits(once, max)).to.deep.equal(once);
			expect(compare(abs(once), abs(value))).to.not.equal(1);
			expect(once.scale).to.be.at.most(Math.max(max, 0) || value.scale);
		}
	});

	it('capFractionDigits leaves a value that already fits untouched', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			expect(capFractionDigits(value, value.scale)).to.deep.equal(value);
			expect(capFractionDigits(value, value.scale + 3)).to.deep.equal(value);
		}
	});

	it('capStringFractionDigits is idempotent and never rewrites typed digits', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const typed = toPlainString(randomDecimal(random));
			const max = Math.floor(random() * 12);
			const once = capStringFractionDigits(typed, { maxFractionDigits: max });
			expect(
				capStringFractionDigits(once, { maxFractionDigits: max })
			).to.equal(once);
			expect(typed.startsWith(once), `${typed} -> ${once}`).to.equal(true);
		}
	});

	it('capStringFractionDigits never changes a value that already fits', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const typed = toPlainString(randomDecimal(random));
			const fraction = typed.split('.')[1] ?? '';
			expect(
				capStringFractionDigits(typed, {
					maxFractionDigits: fraction.length,
				})
			).to.equal(typed);
		}
	});
});

describe('format properties: step snapping', () => {
	it('the output is always a step multiple', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const step = randomStep(random);
			for (const mode of ['toward-zero', 'floor', 'nearest', 'ceil'] as const) {
				const snapped = snapValueToStep(value, step, mode)!;
				expect(
					isStepMultiple(snapped, step),
					`${toPlainString(value)} @ ${toPlainString(step)} ${mode}`
				).to.equal(true);
			}
		}
	});

	it('toward-zero never exceeds the input and never flips the sign', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const step = randomStep(random);
			const snapped = snapValueToStep(value, step, 'toward-zero')!;
			expect(
				compare(abs(snapped), abs(value)),
				`${toPlainString(value)} @ ${toPlainString(step)}`
			).to.not.equal(1);
			if (snapped.sign !== 0) expect(snapped.sign).to.equal(value.sign);
		}
	});

	it('floor never exceeds the input and ceil never falls below it', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const step = randomStep(random);
			expect(
				compare(snapValueToStep(value, step, 'floor')!, value)
			).to.not.equal(1);
			expect(
				compare(snapValueToStep(value, step, 'ceil')!, value)
			).to.not.equal(-1);
		}
	});

	it('nearest is never further from the input than half a step', () => {
		const random = makeRandom(SEED);
		for (let i = 0; i < CASES; i++) {
			const value = randomDecimal(random);
			const step = randomStep(random);
			const snapped = snapValueToStep(value, step, 'nearest')!;
			const floored = snapValueToStep(value, step, 'floor')!;
			const ceiled = snapValueToStep(value, step, 'ceil')!;
			expect(
				compare(snapped, floored) === 0 || compare(snapped, ceiled) === 0
			).to.equal(true);

			// The distance itself, so an always-floor regression cannot pass.
			const scale = Math.max(value.scale, step.scale, snapped.scale);
			const gap = unitsAt(snapped, scale) - unitsAt(value, scale);
			const distance = gap < BigInt(0) ? -gap : gap;
			expect(
				distance * BigInt(2) <= unitsAt(abs(step), scale),
				`${toPlainString(snapped)} is over half of ${toPlainString(
					step
				)} from ${toPlainString(value)}`
			).to.equal(true);
		}
	});
});

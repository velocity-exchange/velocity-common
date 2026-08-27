import { expect } from 'chai';
import {
	ZERO,
	abs,
	capFractionDigits,
	compare,
	fractionDigitCount,
	fromNumber,
	fromParts,
	fromString,
	integerDigitCount,
	isStepMultiple,
	isZero,
	negate,
	rescale,
	roundToDecimals,
	roundToSignificant,
	shiftPoint,
	significantDigitCount,
	snapToStep,
	toDecimal,
	toFixedPointParts,
	toLossyNumber,
	toPlainString,
} from '../../src/format/core/index';

const d = (s: string) => {
	const parsed = fromString(s);
	expect(parsed.status).to.equal('ok');
	return parsed.value!;
};

describe('format/core construction', () => {
	it('fromParts normalises leading zeros and zero sign', () => {
		expect(fromParts(1, '00123', 2)).to.deep.equal({
			sign: 1,
			digits: '123',
			scale: 2,
		});
		expect(fromParts(-1, '000', 4)).to.deep.equal({
			sign: 0,
			digits: '0',
			scale: 4,
		});
	});

	it('fromParts rejects a bad scale or bad digits', () => {
		expect(() => fromParts(1, '1', -1)).to.throw();
		expect(() => fromParts(1, '1', 1.5)).to.throw();
		expect(() => fromParts(1, '1.2', 0)).to.throw();
		expect(() => fromParts(0, '5', 0)).to.throw();
	});

	it('fromString parses plain, signed and fractional forms', () => {
		expect(d('1234.5')).to.deep.equal({ sign: 1, digits: '12345', scale: 1 });
		expect(d('-0.001')).to.deep.equal({ sign: -1, digits: '1', scale: 3 });
		expect(d('.5')).to.deep.equal({ sign: 1, digits: '5', scale: 1 });
		expect(d('+12')).to.deep.equal({ sign: 1, digits: '12', scale: 0 });
		expect(d('0.00')).to.deep.equal({ sign: 0, digits: '0', scale: 2 });
	});

	it('fromString expands both exponent directions exactly', () => {
		expect(toPlainString(d('1e-9'))).to.equal('0.000000001');
		expect(toPlainString(d('1e+21'))).to.equal('1000000000000000000000');
		expect(toPlainString(d('2.95e-7'))).to.equal('0.000000295');
		expect(toPlainString(d('1.5E3'))).to.equal('1500');
	});

	it('fromString rejects grouped and malformed strings', () => {
		expect(fromString('1,234.5').status).to.equal('invalid');
		expect(fromString('').status).to.equal('invalid');
		expect(fromString('abc').status).to.equal('invalid');
		expect(fromString('1.2.3').status).to.equal('invalid');
	});

	it('fromString reports infinities as non-finite', () => {
		expect(fromString('Infinity')).to.include({
			status: 'non-finite',
			nonFiniteSign: 1,
		});
		expect(fromString('-Infinity')).to.include({
			status: 'non-finite',
			nonFiniteSign: -1,
		});
	});

	it('fromNumber uses the shortest round-trip string', () => {
		expect(toPlainString(fromNumber(0.1).value!)).to.equal('0.1');
		expect(toPlainString(fromNumber(1e21).value!)).to.equal(
			'1000000000000000000000'
		);
		expect(fromNumber(-0).value).to.deep.equal({
			sign: 0,
			digits: '0',
			scale: 0,
		});
		expect(fromNumber(NaN).status).to.equal('invalid');
		expect(fromNumber(Infinity)).to.include({
			status: 'non-finite',
			nonFiniteSign: 1,
		});
		expect(fromNumber(-Infinity)).to.include({
			status: 'non-finite',
			nonFiniteSign: -1,
		});
	});

	it('toDecimal accepts nullish, BigNum-like and raw+scale shapes', () => {
		expect(toDecimal(null).status).to.equal('nullish');
		expect(toDecimal(undefined).status).to.equal('nullish');
		expect(
			toDecimal({
				val: { toString: () => '123456' },
				precision: { toString: () => '6' },
			}).value
		).to.deep.equal({ sign: 1, digits: '123456', scale: 6 });
		expect(
			toDecimal({ raw: { toString: () => '-500' }, scale: 3 }).value
		).to.deep.equal({ sign: -1, digits: '500', scale: 3 });
		expect(toDecimal({} as never).status).to.equal('invalid');
	});

	it('toDecimal handles a BigNum with negative precision', () => {
		const parsed = toDecimal({
			val: { toString: () => '15' },
			precision: { toString: () => '-2' },
		});
		expect(toPlainString(parsed.value!)).to.equal('1500');
	});

	it('toDecimal is a no-op on an existing Decimal', () => {
		const value = d('-1.25');
		expect(toDecimal(value).value).to.deep.equal(value);
	});
});

describe('format/core exact operations', () => {
	it('abs, negate and isZero', () => {
		expect(abs(d('-1.5'))).to.deep.equal(d('1.5'));
		expect(negate(d('1.5'))).to.deep.equal(d('-1.5'));
		expect(negate(ZERO)).to.deep.equal(ZERO);
		expect(isZero(d('0.000'))).to.equal(true);
	});

	it('rescale pads up and throws when digits would be lost', () => {
		expect(rescale(d('1.5'), 3)).to.deep.equal({
			sign: 1,
			digits: '1500',
			scale: 3,
		});
		expect(rescale(d('1.500'), 1)).to.deep.equal(d('1.5'));
		expect(() => rescale(d('1.55'), 1)).to.throw();
		expect(() => rescale(d('1.5'), -1)).to.throw();
	});

	it('shiftPoint multiplies by a power of ten exactly', () => {
		expect(toPlainString(shiftPoint(d('0.0234'), 2))).to.equal('2.34');
		expect(toPlainString(shiftPoint(d('1.5'), 3))).to.equal('1500');
		expect(toPlainString(shiftPoint(d('1.5'), -2))).to.equal('0.015');
	});

	it('compare orders across scales and signs', () => {
		expect(compare(d('1.50'), d('1.5'))).to.equal(0);
		expect(compare(d('-1'), d('1'))).to.equal(-1);
		expect(compare(d('10'), d('9.999'))).to.equal(1);
		expect(compare(d('-10'), d('-9.999'))).to.equal(-1);
		expect(compare(ZERO, d('0.000'))).to.equal(0);
		expect(compare(d('2.00'), d('2'))).to.equal(0);
	});

	it('digit counts trim trailing zeros', () => {
		expect(significantDigitCount(d('1.2300'))).to.equal(3);
		expect(significantDigitCount(ZERO)).to.equal(0);
		expect(fractionDigitCount(d('1.2300'))).to.equal(2);
		expect(fractionDigitCount(d('100'))).to.equal(0);
		expect(integerDigitCount(d('0.5'))).to.equal(1);
		expect(integerDigitCount(d('1234'))).to.equal(4);
	});
});

describe('format/core rounding', () => {
	it('every mode on an exact half', () => {
		const half = d('1.5');
		expect(toPlainString(roundToDecimals(half, 0, 'truncate'))).to.equal('1');
		expect(toPlainString(roundToDecimals(half, 0, 'floor'))).to.equal('1');
		expect(toPlainString(roundToDecimals(half, 0, 'ceil'))).to.equal('2');
		expect(toPlainString(roundToDecimals(half, 0, 'expand'))).to.equal('2');
		expect(toPlainString(roundToDecimals(half, 0, 'half-up'))).to.equal('2');
		expect(toPlainString(roundToDecimals(half, 0, 'half-even'))).to.equal('2');
		expect(toPlainString(roundToDecimals(d('2.5'), 0, 'half-even'))).to.equal(
			'2'
		);
	});

	it('truncate and floor differ on negatives', () => {
		expect(toPlainString(roundToDecimals(d('-1.999'), 2, 'truncate'))).to.equal(
			'-1.99'
		);
		expect(toPlainString(roundToDecimals(d('-1.999'), 2, 'floor'))).to.equal(
			'-2.00'
		);
		expect(toPlainString(roundToDecimals(d('-1.999'), 2, 'ceil'))).to.equal(
			'-1.99'
		);
		expect(toPlainString(roundToDecimals(d('-1.999'), 2, 'expand'))).to.equal(
			'-2.00'
		);
	});

	it('rounding to more decimals pads without changing value', () => {
		expect(toPlainString(roundToDecimals(d('1.5'), 4, 'truncate'))).to.equal(
			'1.5000'
		);
	});

	it('rounding a tiny negative away collapses the sign', () => {
		const rounded = roundToDecimals(d('-0.001'), 2, 'truncate');
		expect(rounded.sign).to.equal(0);
		expect(toPlainString(rounded)).to.equal('0.00');
	});

	it('roundToDecimals rejects a negative decimal count', () => {
		expect(() => roundToDecimals(d('1.5'), -1, 'truncate')).to.throw();
	});

	it('roundToSignificant zeroes low integer digits instead of using a negative place count', () => {
		expect(
			toPlainString(roundToSignificant(d('1234567'), 6, 'half-up'))
		).to.equal('1234570');
		expect(
			toPlainString(roundToSignificant(d('1234567'), 6, 'truncate'))
		).to.equal('1234560');
		expect(
			toPlainString(roundToSignificant(d('12345678'), 6, 'truncate'))
		).to.equal('12345600');
	});

	it('roundToSignificant re-derives the magnitude after a carry', () => {
		expect(
			toPlainString(roundToSignificant(d('9.999999'), 6, 'half-up'))
		).to.equal('10.0000');
		expect(toPlainString(roundToSignificant(d('999'), 2, 'half-up'))).to.equal(
			'1000'
		);
	});

	it('roundToSignificant leaves a value that already fits', () => {
		expect(roundToSignificant(d('0.00012345'), 6, 'truncate')).to.deep.equal(
			d('0.00012345')
		);
		expect(roundToSignificant(ZERO, 6, 'truncate')).to.deep.equal(ZERO);
	});
});

describe('format/core egress', () => {
	it('toPlainString never emits exponent or separator notation', () => {
		expect(toPlainString(d('1e-9'))).to.equal('0.000000001');
		expect(toPlainString(d('1234567.5'))).to.equal('1234567.5');
		expect(toPlainString(fromParts(0, '0', 2))).to.equal('0.00');
		expect(toPlainString(d('-0.5'))).to.equal('-0.5');
	});

	it('toLossyNumber is the single named float exit', () => {
		expect(toLossyNumber(d('1.25'))).to.equal(1.25);
		expect(toLossyNumber(d('-0.001'))).to.equal(-0.001);
	});

	it('toFixedPointParts rebuilds BN space at the target scale', () => {
		expect(toFixedPointParts(d('1.5'), 6, 'truncate')).to.deep.equal({
			units: '1500000',
			scale: 6,
			sign: 1,
		});
		expect(toFixedPointParts(d('-1.999'), 2, 'floor')).to.deep.equal({
			units: '200',
			scale: 2,
			sign: -1,
		});
		expect(toFixedPointParts(d('0.004'), 2, 'truncate')).to.deep.equal({
			units: '0',
			scale: 2,
			sign: 0,
		});
	});
});

describe('format/core step maths', () => {
	it('snapToStep in every mode', () => {
		const step = d('0.01');
		expect(toPlainString(snapToStep(d('1.237'), step, 'toward-zero'))).to.equal(
			'1.23'
		);
		expect(
			toPlainString(snapToStep(d('-1.237'), step, 'toward-zero'))
		).to.equal('-1.23');
		expect(toPlainString(snapToStep(d('-1.237'), step, 'floor'))).to.equal(
			'-1.24'
		);
		expect(toPlainString(snapToStep(d('1.231'), step, 'ceil'))).to.equal(
			'1.24'
		);
		expect(toPlainString(snapToStep(d('1.235'), step, 'nearest'))).to.equal(
			'1.24'
		);
		expect(toPlainString(snapToStep(d('1.234'), step, 'nearest'))).to.equal(
			'1.23'
		);
	});

	it('snapToStep is exact on a step that stringifies exponentially', () => {
		expect(
			toPlainString(snapToStep(d('1.23456789'), d('1e-7'), 'toward-zero'))
		).to.equal('1.2345678');
	});

	it('snapToStep leaves an exact multiple alone', () => {
		expect(toPlainString(snapToStep(d('1.20'), d('0.01'), 'ceil'))).to.equal(
			'1.20'
		);
	});

	it('snapToStep rejects a zero step', () => {
		expect(() => snapToStep(d('1'), ZERO, 'floor')).to.throw();
	});

	it('isStepMultiple is exact, with no float tolerance', () => {
		expect(isStepMultiple(d('5.1'), d('0.1'))).to.equal(true);
		expect(isStepMultiple(d('5.15'), d('0.1'))).to.equal(false);
		expect(isStepMultiple(ZERO, d('0.1'))).to.equal(true);
	});

	it('capFractionDigits truncates and never pads', () => {
		expect(toPlainString(capFractionDigits(d('1.23456'), 2))).to.equal('1.23');
		expect(toPlainString(capFractionDigits(d('1.2'), 6))).to.equal('1.2');
		expect(toPlainString(capFractionDigits(d('-1.999'), 2))).to.equal('-1.99');
	});
});

export const DIGITS_ONLY = /^[0-9]+$/;

export function zeros(count: number): string {
	return count > 0 ? '0'.repeat(count) : '';
}

export function stripLeadingZeros(digits: string): string {
	const stripped = digits.replace(/^0+/, '');
	return stripped === '' ? '0' : stripped;
}

export function trailingZeroCount(digits: string): number {
	if (digits === '0') return 0;
	let count = 0;
	for (let i = digits.length - 1; i >= 0 && digits[i] === '0'; i--) count++;
	return count;
}

/** Adds one to an unsigned decimal digit string, growing it on carry. */
export function incrementDigits(digits: string): string {
	const out = digits.split('');
	let i = out.length - 1;
	while (i >= 0) {
		if (out[i] === '9') {
			out[i] = '0';
			i--;
		} else {
			out[i] = String(Number(out[i]) + 1);
			return out.join('');
		}
	}
	return `1${out.join('')}`;
}

export function isAllZeros(digits: string): boolean {
	return !/[1-9]/.test(digits);
}

/** Compares two unsigned decimal digit strings. */
export function compareDigits(a: string, b: string): -1 | 0 | 1 {
	const left = stripLeadingZeros(a);
	const right = stripLeadingZeros(b);
	if (left.length !== right.length) return left.length < right.length ? -1 : 1;
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

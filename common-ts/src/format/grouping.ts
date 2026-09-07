import { GROUP_SEPARATOR } from './locale';

const GROUP_SIZE = 3;

/** Groups an unsigned integer digit string into three-digit runs. */
export function groupInteger(integerDigits: string): string {
	const chunks: string[] = [];
	let remaining = integerDigits;
	while (remaining.length > GROUP_SIZE) {
		chunks.unshift(remaining.slice(remaining.length - GROUP_SIZE));
		remaining = remaining.slice(0, remaining.length - GROUP_SIZE);
	}
	chunks.unshift(remaining);
	return chunks.join(GROUP_SEPARATOR);
}

/** Removes every group separator. Does not touch the decimal separator. */
export function ungroup(text: string): string {
	return text.split(GROUP_SEPARATOR).join('');
}

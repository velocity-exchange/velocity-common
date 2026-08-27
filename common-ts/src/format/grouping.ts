import { LocaleConfig } from './locale';

/**
 * Groups an unsigned integer digit string right-to-left. The last entry of
 * `groupSizes` repeats, so [3] is uniform and [3,2] is lakh grouping.
 */
export function groupInteger(
	integerDigits: string,
	locale: LocaleConfig
): string {
	const sizes = locale.groupSizes.filter((s) => Number.isInteger(s) && s > 0);
	if (sizes.length === 0 || locale.group === '') return integerDigits;

	const chunks: string[] = [];
	let remaining = integerDigits;
	let index = 0;
	while (remaining.length > 0) {
		const size = sizes[Math.min(index, sizes.length - 1)];
		if (remaining.length <= size) {
			chunks.unshift(remaining);
			break;
		}
		chunks.unshift(remaining.slice(remaining.length - size));
		remaining = remaining.slice(0, remaining.length - size);
		index++;
	}
	return chunks.join(locale.group);
}

/** Removes every group separator. Does not touch the decimal separator. */
export function ungroup(text: string, locale: LocaleConfig): string {
	if (locale.group === '') return text;
	return text.split(locale.group).join('');
}

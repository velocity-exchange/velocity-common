import { PublicKey } from '@velocity-exchange/sdk';
import { trimFractionZeros } from '../../format/trim';
import { getCachedUiString } from '../core/cache';

export const abbreviateAddress = (address: string | PublicKey, length = 4) => {
	if (!address) return '';
	const authString = address.toString();
	return getCachedUiString('abbreviate', authString, length);
};

/**
 * Trim trailing zeros from a numerical string
 * @param str - numerical string to format
 * @param zerosToShow - max number of zeros to show after the decimal. Similar to number.toFixed() but won't trim non-zero values. Optional, default value is 1
 *
 * @deprecated Use `formatText` with `DigitSpec.minDecimals` from
 * `@velocity-exchange/common/format`, which trims through the same core
 * trimmer this now delegates to.
 */
export const trimTrailingZeros = (str: string, zerosToShow = 1) => {
	// Ignore strings with no decimal point
	if (!str.includes('.')) return str;

	const sides = str.split('.');

	sides[1] = trimFractionZeros(sides[1], zerosToShow);

	if (sides[1].length === 0) {
		return sides[0];
	} else {
		return sides.join('.');
	}
};

export const toSnakeCase = (str: string): string =>
	str.replace(/[^\w]/g, '_').toLowerCase();

export const toCamelCase = (str: string): string => {
	const words = str.split(/[_\-\s]+/); // split on underscores, hyphens, and spaces
	const firstWord = words[0].toLowerCase();
	const restWords = words
		.slice(1)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
	return [firstWord, ...restWords].join('');
};

export const normalizeBaseAssetSymbol = (symbol: string) => {
	return symbol.replace(/^1M/, '');
};

export function abbreviateAccountName(
	name: string,
	size = 8,
	opts?: {
		ellipsisMiddle?: boolean;
	}
) {
	if (name.length <= size) return name;

	if (opts?.ellipsisMiddle) {
		const length = name.length;
		const sizeMid = Math.floor(size / 2);

		return name.slice(0, sizeMid) + '...' + name.slice(length - sizeMid);
	}

	return name.slice(0, size) + '...';
}

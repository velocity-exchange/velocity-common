import { PublicKey } from '@velocity-exchange/sdk';
import { getCachedUiString } from '../core/cache';

export const abbreviateAddress = (address: string | PublicKey, length = 4) => {
	if (!address) return '';
	const authString = address.toString();
	return getCachedUiString('abbreviate', authString, length);
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

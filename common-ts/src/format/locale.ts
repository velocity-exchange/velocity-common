export interface LocaleConfig {
	readonly tag: string;
	readonly decimal: string;
	readonly group: string;
	/** Right-to-left group sizes. [3] means uniform 3. [3,2] is en-IN lakh grouping. */
	readonly groupSizes: readonly number[];
}

export const EN_US: LocaleConfig = Object.freeze({
	tag: 'en-US',
	decimal: '.',
	group: ',',
	groupSizes: Object.freeze([3]),
});

let defaultLocale: LocaleConfig = EN_US;

export function getDefaultLocale(): LocaleConfig {
	return defaultLocale;
}

/**
 * Module-global display locale. Unlike BigNum.setLocale it is read only by the
 * format layer, never by a value path, so it cannot corrupt order maths.
 */
export function setDefaultLocale(locale: LocaleConfig): LocaleConfig {
	defaultLocale = locale;
	return defaultLocale;
}

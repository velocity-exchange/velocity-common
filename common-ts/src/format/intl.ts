import { EN_US, LocaleConfig, setDefaultLocale } from './locale';

/**
 * The ONLY module in the format layer allowed to touch Intl. The default
 * ./format path never imports it, so the pure fixed-point path stays free of
 * locale-implementation-defined rounding.
 */
function separatorsFor(tag: string): { decimal: string; group: string } {
	const parts = new Intl.NumberFormat(tag).formatToParts(12345.6);
	const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
	const group = parts.find((p) => p.type === 'group')?.value ?? '';
	return { decimal, group };
}

function groupSizesFor(tag: string, group: string): number[] {
	if (group === '') return [3];
	const formatted = new Intl.NumberFormat(tag).format(1234567890123);
	const chunks = formatted.split(group);
	if (chunks.length < 2) return [3];
	const rightToLeft = chunks
		.slice(1)
		.reverse()
		.map((c) => c.length);
	const primary = rightToLeft[0];
	const secondary = rightToLeft.find((size) => size !== primary);
	return secondary === undefined ? [primary] : [primary, secondary];
}

export function localeFromTag(tag: string): LocaleConfig {
	try {
		const { decimal, group } = separatorsFor(tag);
		return Object.freeze({
			tag,
			decimal,
			group,
			groupSizes: Object.freeze(groupSizesFor(tag, group)),
		});
	} catch {
		return EN_US;
	}
}

/** Sets the display locale and returns the config the mask and display share. */
export function setNumberLocale(tag: string): LocaleConfig {
	return setDefaultLocale(localeFromTag(tag));
}

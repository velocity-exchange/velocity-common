import { DigitSpec, formatText } from '../format/index';

interface MillifyOptions {
	precision?: number;
	decimals?: number;
	notation?: 'scientific' | 'financial';
	trimEndingZeroes?: boolean;
}

/**
 * @deprecated Use `formatText` with an `abbreviate` spec from
 * '@velocity-exchange/common/format'.
 */
export default function millify(
	value: number,
	options?: MillifyOptions
): string {
	const precision = options?.precision ?? 6;
	const trimEndingZeroes = options?.trimEndingZeroes ?? false;
	const significant: DigitSpec = {
		kind: 'significant',
		significant: precision,
		rounding: 'half-up',
	};

	return formatText(value, {
		digits: significant,
		grouping: false,
		trimTrailingZeros: trimEndingZeroes,
		abbreviate: {
			threshold: '1000',
			units: options?.notation === 'scientific' ? 'si' : 'financial',
			digits:
				options?.decimals === undefined
					? significant
					: {
							kind: 'decimals',
							decimals: options.decimals,
							rounding: 'half-up',
						},
			trimTrailingZeros: trimEndingZeroes,
		},
		fallback: '0',
		invalidText: '0',
	});
}

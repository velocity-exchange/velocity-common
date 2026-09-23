import { SpotMarketConfig } from '@velocity-exchange/sdk';
import { formatText } from '../../format/formatValue';
import { parseInput } from '../../format/input';
import { capStringFractionDigits } from '../../format/market';
import { PRESETS } from '../../format/presets';

const formatTokenInputCurried =
	(setAmount: (amount: string) => void, spotMarketConfig: SpotMarketConfig) =>
	(newAmount: string) => {
		if (newAmount === '') {
			setAmount('');
			return;
		}

		// if last char of string is a decimal point, don't format
		if (newAmount[newAmount.length - 1] === '.') {
			setAmount(newAmount);
			return;
		}

		const precisionExp = spotMarketConfig.precisionExp.toNumber();
		if (parseInput(newAmount, precisionExp).status !== 'ok') return;

		// exponent notation collapses to plain digits here, so capping the
		// fraction below never mistakes an exponent suffix for extra decimals.
		const plain = formatText(newAmount, PRESETS.plain);
		setAmount(
			capStringFractionDigits(plain, { maxFractionDigits: precisionExp })
		);
	};

export { formatTokenInputCurried };

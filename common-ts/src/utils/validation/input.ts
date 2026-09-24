import { SpotMarketConfig } from '@velocity-exchange/sdk';
import { formatText } from '../../format/formatValue';
import { parseInput } from '../../format/input';
import { capStringFractionDigits } from '../../format/market';
import { PRESETS } from '../../format/presets';

const formatTokenInputCurried =
	(setAmount: (amount: string) => void, spotMarketConfig: SpotMarketConfig) =>
	(newAmount: string) => {
		if (isNaN(+newAmount)) return;

		if (newAmount === '') {
			setAmount('');
			return;
		}

		// a valid number's in-progress trailing separator is kept as typed;
		// isNaN above already rejected a bare or malformed one (e.g. '.', 'abc.')
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

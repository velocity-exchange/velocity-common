import { PublicKey } from '@velocity-exchange/sdk';

export { isValidBase58 } from '../strings/parse';

export const isValidPublicKey = (str: string): boolean => {
	try {
		new PublicKey(str);
		return true;
	} catch {
		return false;
	}
};

// Chain ID constants
export const BITCOIN_CHAIN_ID = '8253038';
export const TRON_CHAIN_ID = '728126428';
export const SOLANA_CHAIN_ID = '1151111081099710';

// EVM chains (all others default to EVM validation)
const NON_EVM_CHAIN_IDS = new Set([
	BITCOIN_CHAIN_ID,
	TRON_CHAIN_ID,
	SOLANA_CHAIN_ID,
]);

function isValidEvmAddress(address: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function isValidBitcoinAddress(address: string): boolean {
	// P2PKH (1...), P2SH (3...)
	if (/^[13]/.test(address)) {
		return /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34})$/.test(
			address
		);
	}
	// Bech32 — must be single-case (lowercase or uppercase, not mixed)
	if (address.startsWith('bc1')) {
		return /^bc1[0-9a-z]{25,62}$/.test(address);
	}
	if (address.startsWith('BC1')) {
		return /^BC1[0-9A-Z]{25,62}$/.test(address);
	}
	return false;
}

function isValidTronAddress(address: string): boolean {
	// Tron addresses start with T and are 34 chars, base58
	return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

function isValidSolanaAddress(address: string): boolean {
	return isValidPublicKey(address);
}

/**
 * Validates a recipient address based on the destination chain.
 * EVM chains use 0x-prefixed hex address format.
 * Bitcoin, Tron, and Solana each have their own format.
 */
export function isValidAddressForChain(
	address: string,
	chainId: string | null
): boolean {
	if (!address || !chainId) return false;

	if (chainId === BITCOIN_CHAIN_ID) return isValidBitcoinAddress(address);
	if (chainId === TRON_CHAIN_ID) return isValidTronAddress(address);
	if (chainId === SOLANA_CHAIN_ID) return isValidSolanaAddress(address);

	return isValidEvmAddress(address);
}

/**
 * Returns a human-readable address format hint for the given chain.
 */
export function getAddressFormatHint(chainId: string | null): string {
	if (!chainId) return 'address';
	if (chainId === BITCOIN_CHAIN_ID) return 'Bitcoin address (1.., 3.., bc1..)';
	if (chainId === TRON_CHAIN_ID) return 'Tron address (T..)';
	if (chainId === SOLANA_CHAIN_ID) return 'Solana address';
	return 'EVM address (0x..)';
}

export function isEvmChain(chainId: string): boolean {
	return !NON_EVM_CHAIN_IDS.has(chainId);
}

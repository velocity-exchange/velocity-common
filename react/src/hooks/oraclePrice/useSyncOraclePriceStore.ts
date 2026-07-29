import {
	BigNum,
	BulkAccountLoader,
	OracleSource,
	PRICE_PRECISION_EXP,
	PublicKey,
	getOracleClient,
} from '@velocity-exchange/sdk';
import {
	OraclePriceStore,
	useCommonDriftStore,
	useOraclePriceStore,
} from '../../stores';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import { ENUM_UTILS, UIMarket } from '@drift/common';
import { useInterval } from 'react-use';

type OracleClient = ReturnType<typeof getOracleClient>;

export type MarketAndAccount = {
	market: UIMarket;
	accountToUse: PublicKey;
};

const ORACLE_CLIENT_KEYS = Object.values(OracleSource).map(
	(value) => Object.keys(value)[0]
);
type OracleClientsMap = Map<string, OracleClient | undefined>;
const DEFAULT_ORACLE_CLIENTS_MAP: OracleClientsMap = ORACLE_CLIENT_KEYS.reduce(
	(acc, key) => {
		acc.set(key, undefined);
		return acc;
	},
	new Map()
);

export const useSyncOraclePriceStore = (
	marketsAndAccounts: MarketAndAccount[],
	refreshTimeMs = 1000
) => {
	const driftClient = useCommonDriftStore((s) => s.driftClient.client);
	const connection = useCommonDriftStore((s) => s.connection);
	const bulkAccountLoader = useCommonDriftStore((s) => s.bulkAccountLoader);
	const setOraclePriceStore = useOraclePriceStore((s) => s.set);

	const [oracleClients, setOracleClients] = useState<OracleClientsMap>(
		DEFAULT_ORACLE_CLIENTS_MAP
	);

	// Keep a local price store state so that the app isn't re-rendering non-stop for every price change
	const [localPriceStoreState, setLocalPriceStoreState] = useImmer<
		OraclePriceStore['symbolMap']
	>({});

	const bulkLoaderCallbacks = useRef<[string, PublicKey][]>([]);

	const areOracleClientsReady = Array.from(oracleClients.values()).every(
		(client) => !!client
	);

	const getMatchingOracleClient = useCallback(
		(oracleSource: OracleSource) => {
			if (!areOracleClientsReady)
				throw new Error('Oracle clients are not ready');

			const oracleSourceString = ENUM_UTILS.toStr(oracleSource);
			const oracleClient = oracleClients.get(oracleSourceString);

			if (!oracleClient) {
				console.error(JSON.stringify(oracleSource));
				throw new Error(
					`Unaccounted for oracle type in useSyncOraclePriceStore.`
				);
			}

			return oracleClient;
		},
		[areOracleClientsReady]
	);

	useEffect(() => {
		if (!connection) return;
		if (!driftClient) return;

		ORACLE_CLIENT_KEYS.forEach((oracleSourceKey) => {
			const oracleSource = ENUM_UTILS.toObj(oracleSourceKey) as OracleSource;
			const oracleClient = getOracleClient(
				oracleSource,
				connection,
				driftClient.program
			);
			setOracleClients((s) => {
				s.set(oracleSourceKey, oracleClient);
				return s;
			});
		});
	}, [connection, driftClient]);

	useEffect(() => {
		if (!connection) return;
		if (!bulkAccountLoader) return;
		if (!areOracleClientsReady) return;

		fetchAndSetPrices(bulkAccountLoader, marketsAndAccounts);

		const cleanup = () => {
			if (bulkLoaderCallbacks.current.length) {
				bulkLoaderCallbacks.current.forEach(([callbackId, accountKey]) => {
					bulkAccountLoader.removeAccount(accountKey, callbackId);
				});
				bulkLoaderCallbacks.current = [];
			}
		};

		return cleanup;
	}, [
		connection,
		areOracleClientsReady,
		bulkAccountLoader,
		getMatchingOracleClient,
	]);

	async function fetchAndSetPrices(
		bulkAccountLoader: BulkAccountLoader,
		marketsAndAccounts: MarketAndAccount[]
	) {
		marketsAndAccounts.forEach(async ({ market, accountToUse }) => {
			const callbackId = await bulkAccountLoader.addAccount(
				accountToUse,
				async (accountDataBuffer) => {
					if (!accountDataBuffer) return;

					const accountClient = getMatchingOracleClient(
						market.market.oracleSource
					);
					const oraclePriceData =
						await accountClient.getOraclePriceDataFromBuffer(accountDataBuffer);

					setLocalPriceStoreState((s) => {
						s[market.key] = {
							market,
							priceData: {
								price: BigNum.from(
									oraclePriceData.price,
									PRICE_PRECISION_EXP
								).toNum(),
								slot: oraclePriceData.slot.toNumber(),
								confidence: BigNum.from(
									oraclePriceData.confidence,
									PRICE_PRECISION_EXP
								).toNum(),
								twap: BigNum.from(
									oraclePriceData.twap,
									PRICE_PRECISION_EXP
								).toNum(),
								twapConfidence: BigNum.from(
									oraclePriceData.twapConfidence,
									PRICE_PRECISION_EXP
								).toNum(),
								maxPrice: oraclePriceData.maxPrice
									? BigNum.from(
											oraclePriceData.maxPrice,
											PRICE_PRECISION_EXP
										).toNum()
									: undefined,
							},
							rawPriceData: oraclePriceData,
						};
					});
				}
			);

			bulkLoaderCallbacks.current.push([callbackId, accountToUse]);
		});
	}

	// Update the price store every refreshTimeMs
	useInterval(() => {
		setOraclePriceStore((s) => {
			s.symbolMap = localPriceStoreState;
		});
	}, refreshTimeMs);
};

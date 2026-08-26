import { VelocityClient, OracleSource } from '@velocity-exchange/sdk';
import { TransactionInstruction } from '@solana/web3.js';
import { expect } from 'chai';
import sinon from 'sinon';
import { getPythLazerUpdateIxs } from '../../src/velocity/base/actions/markets/oracleCrank/pythLazerCrank';
import {
	OracleCrankDataFetcher,
	OracleMarketConfig,
} from '../../src/velocity/base/actions/markets/oracleCrank/types';
import { DEFAULT_PRECEDING_IXS_COUNT } from '../../src/velocity/base/actions/markets/oracleCrank/constants';

describe('getPythLazerUpdateIxs', () => {
	let velocityClient: sinon.SinonStubbedInstance<VelocityClient>;
	let fetcher: sinon.SinonStub;

	beforeEach(() => {
		velocityClient = sinon.createStubInstance(VelocityClient);
		fetcher = sinon.stub();
	});

	afterEach(() => {
		sinon.restore();
	});

	it('should return empty array when no pyth lazer markets', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_PULL,
				pythFeedId: 'feed-a',
			} as unknown as OracleMarketConfig,
		];

		const result = await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher
		);

		expect(result).to.deep.equal([]);
		expect(fetcher.called).to.be.false;
	});

	it('should call fetcher with correct deduped feed IDs', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
			{
				oracleSource: OracleSource.PYTH_LAZER_1K,
				pythLazerId: 2,
			} as unknown as OracleMarketConfig,
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
		];

		fetcher.resolves({ success: true, data: 'hex-data' });

		const mockIxs = [{} as TransactionInstruction];
		velocityClient.getPostPythLazerOracleUpdateIxs.resolves(mockIxs);

		const result = await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher,
			10
		);

		expect(fetcher.calledOnce).to.be.true;
		expect(fetcher.firstCall.args[0]).to.equal('pythLazer');
		expect(fetcher.firstCall.args[1]).to.deep.equal([1, 2]);
		expect(result).to.deep.equal(mockIxs);
	});

	it('should return empty array on fetch failure', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
		];

		fetcher.resolves({ success: false });

		const result = await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher
		);

		expect(result).to.deep.equal([]);
		expect(velocityClient.getPostPythLazerOracleUpdateIxs.called).to.be.false;
	});

	it('should pass result.data directly and correct precedingIxsCount + 1', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
		];

		fetcher.resolves({ success: true, data: 'hex-data' });
		velocityClient.getPostPythLazerOracleUpdateIxs.resolves([]);

		const precedingIxsCount = 5;
		await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher,
			undefined,
			precedingIxsCount
		);

		expect(velocityClient.getPostPythLazerOracleUpdateIxs.calledOnce).to.be
			.true;
		const [ids, data, precedingIxs, overrideIndex] =
			velocityClient.getPostPythLazerOracleUpdateIxs.firstCall.args;
		expect(ids).to.deep.equal([1]);
		expect(data).to.equal('hex-data');
		expect(precedingIxs).to.be.undefined;
		expect(overrideIndex).to.equal(precedingIxsCount + 1);
	});

	it('should use DEFAULT_PRECEDING_IXS_COUNT when not specified', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
		];

		fetcher.resolves({ success: true, data: 'hex-data' });
		velocityClient.getPostPythLazerOracleUpdateIxs.resolves([]);

		await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher
		);

		const [, , , overrideIndex] =
			velocityClient.getPostPythLazerOracleUpdateIxs.firstCall.args;
		expect(overrideIndex).to.equal(DEFAULT_PRECEDING_IXS_COUNT + 1);
	});

	it('should return empty array on SDK error', async () => {
		const configs: OracleMarketConfig[] = [
			{
				oracleSource: OracleSource.PYTH_LAZER,
				pythLazerId: 1,
			} as unknown as OracleMarketConfig,
		];

		fetcher.resolves({ success: true, data: 'hex-data' });
		velocityClient.getPostPythLazerOracleUpdateIxs.rejects(
			new Error('SDK error')
		);

		const result = await getPythLazerUpdateIxs(
			configs,
			velocityClient as unknown as VelocityClient,
			fetcher as OracleCrankDataFetcher
		);

		expect(result).to.deep.equal([]);
	});
});

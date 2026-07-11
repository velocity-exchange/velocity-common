import {
	BASE_PRECISION,
	BN,
	BigNum,
	MarketType,
	OrderType,
	PRICE_PRECISION,
	PRICE_PRECISION_EXP,
	PositionDirection,
} from '@velocity-exchange/sdk';
import {
	deriveMarketOrderParams,
	getLimitAuctionParams,
	getMarketAuctionParams,
	getMarketOrderLimitPrice,
} from '../../src/utils/trading';
import { ENUM_UTILS } from '../../src';
import { expect } from 'chai';

describe('COMMON_UI_UTILS OrderParams Tests', () => {
	describe('getMarketAuctionParams', () => {
		it('should correctly generate params for long', () => {
			const result = getMarketAuctionParams({
				direction: PositionDirection.LONG,
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				endPriceFromSettings: new BN(105).mul(PRICE_PRECISION),
				limitPrice: new BN(103).mul(PRICE_PRECISION),
				duration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
			});

			expect(result.auctionStartPrice.toString()).to.equal('99950000');
			expect(result.auctionEndPrice.toString()).to.equal('103000000');
		});

		it('should correctly generate params for short', () => {
			const result = getMarketAuctionParams({
				direction: PositionDirection.SHORT,
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				endPriceFromSettings: new BN(95).mul(PRICE_PRECISION),
				limitPrice: new BN(97).mul(PRICE_PRECISION),
				duration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
			});

			expect(result.auctionStartPrice.toString()).to.equal('100050000');
			expect(result.auctionEndPrice.toString()).to.equal('97000000');
		});
	});

	describe('getLimitAuctionParams', () => {
		it('should correctly generate params for long', () => {
			const result = getLimitAuctionParams({
				direction: PositionDirection.LONG,
				inputPrice: BigNum.from(
					new BN(108).mul(PRICE_PRECISION),
					PRICE_PRECISION_EXP
				),
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				duration: 60,
				auctionStartPriceOffset: -0.05,
			});

			expect(result.auctionStartPrice.toString()).to.equal('99946000');
			expect(result.auctionEndPrice.toString()).to.equal('108000000');
		});

		it('should correctly generate params for short', () => {
			const result = getLimitAuctionParams({
				direction: PositionDirection.SHORT,
				inputPrice: BigNum.from(
					new BN(92).mul(PRICE_PRECISION),
					PRICE_PRECISION_EXP
				),
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				duration: 60,
				auctionStartPriceOffset: -0.05,
			});

			expect(result.auctionStartPrice.toString()).to.equal('100046000');
			expect(result.auctionEndPrice.toString()).to.equal('92000000');
		});

		it('should not generate any auction params for long if limit price is lower than startPriceForSettings', () => {
			const result = getLimitAuctionParams({
				direction: PositionDirection.LONG,
				inputPrice: BigNum.from(
					new BN(92).mul(PRICE_PRECISION),
					PRICE_PRECISION_EXP
				),
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				duration: 60,
				auctionStartPriceOffset: -0.05,
			});

			expect(result.auctionDuration).to.be.null;
			expect(result.auctionStartPrice?.toString()).to.be.undefined;
			expect(result.auctionEndPrice?.toString()).to.be.undefined;
		});

		it('should not generate any auction params for short if limit price is higher than startPriceFromSettings', () => {
			const result = getLimitAuctionParams({
				direction: PositionDirection.SHORT,
				inputPrice: BigNum.from(
					new BN(108).mul(PRICE_PRECISION),
					PRICE_PRECISION_EXP
				),
				startPriceFromSettings: new BN(100).mul(PRICE_PRECISION),
				duration: 60,
				auctionStartPriceOffset: -0.05,
			});

			expect(result.auctionDuration).to.be.null;
			expect(result.auctionStartPrice?.toString()).to.be.undefined;
			expect(result.auctionEndPrice?.toString()).to.be.undefined;
		});
	});

	describe('deriveMarketOrderParams', () => {
		it('should correctly generate params for LONG oracle order when oracle > est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(108).mul(PRICE_PRECISION),
				worstPrice: new BN(105).mul(PRICE_PRECISION),
				markPrice: new BN(108).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
				auctionStartPriceOffsetFrom: 'entry',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 0.5,
				isOracleOrder: true,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.ORACLE)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('-8050000');
			expect(result.auctionEndPrice?.toString()).to.equal('-7500000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for LONG non-oracle market order when oracle > est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(108).mul(PRICE_PRECISION),
				worstPrice: new BN(105).mul(PRICE_PRECISION),
				markPrice: new BN(108).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
				auctionStartPriceOffsetFrom: 'best',
				auctionEndPriceOffsetFrom: 'oracle',
				slippageTolerance: 3,
				isOracleOrder: false,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('98950500');
			expect(result.auctionEndPrice?.toString()).to.equal('101970000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for LONG oracle order when oracle < est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(92).mul(PRICE_PRECISION),
				worstPrice: new BN(105).mul(PRICE_PRECISION),
				markPrice: new BN(92).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
				auctionStartPriceOffsetFrom: 'entry',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 0.5,
				isOracleOrder: true,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.ORACLE)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('7950000');
			expect(result.auctionEndPrice?.toString()).to.equal('8500000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for SHORT oracle order when oracle < est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.SHORT,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(101).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(92).mul(PRICE_PRECISION),
				worstPrice: new BN(95).mul(PRICE_PRECISION),
				markPrice: new BN(92).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
				auctionStartPriceOffsetFrom: 'entry',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 0.5,
				isOracleOrder: true,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.ORACLE)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('8050000');
			expect(result.auctionEndPrice?.toString()).to.equal('7500000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for SHORT oracle order when oracle > est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.SHORT,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(108).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(101).mul(PRICE_PRECISION),
				worstPrice: new BN(95).mul(PRICE_PRECISION),
				markPrice: new BN(108).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: -0.05,
				auctionEndPriceOffset: 0.05,
				auctionStartPriceOffsetFrom: 'best',
				auctionEndPriceOffsetFrom: 'entry',
				slippageTolerance: 0.5,
				isOracleOrder: true,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.ORACLE)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('7054000');
			expect(result.auctionEndPrice?.toString()).to.equal('6460000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for SHORT non-oracle market order when oracle > est entry', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.SHORT,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: true,
				bestPrice: new BN(101).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(108).mul(PRICE_PRECISION),
				worstPrice: new BN(95).mul(PRICE_PRECISION),
				markPrice: new BN(108).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'oracle',
				auctionEndPriceOffsetFrom: 'entry',
				slippageTolerance: 50,
				isOracleOrder: false,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('108000000');
			expect(result.auctionEndPrice?.toString()).to.equal('100000000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(false);
		});

		it('should correctly generate params for LONG non-oracle market order with auction end price capped by slippage', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(101).mul(PRICE_PRECISION),
				oraclePrice: new BN(104).mul(PRICE_PRECISION),
				worstPrice: new BN(108).mul(PRICE_PRECISION),
				markPrice: new BN(100).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'mark',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 1,
				isOracleOrder: false,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('100000000');
			expect(result.auctionEndPrice?.toString()).to.equal('101000000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(true);
		});

		it('should correctly generate params for LONG non-oracle market order with auction end price NOT capped by slippage', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: true,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(101).mul(PRICE_PRECISION),
				oraclePrice: new BN(104).mul(PRICE_PRECISION),
				worstPrice: new BN(108).mul(PRICE_PRECISION),
				markPrice: new BN(100).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'mark',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 50,
				isOracleOrder: false,
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('100000000');
			expect(result.auctionEndPrice?.toString()).to.equal('108000000');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(false);
		});

		it('should correctly generate params for LONG non-oracle market order with auction end price NOT capped by slippage AND an additional offset', () => {
			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: true,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(101).mul(PRICE_PRECISION),
				oraclePrice: new BN(104).mul(PRICE_PRECISION),
				worstPrice: new BN(108).mul(PRICE_PRECISION),
				markPrice: new BN(100).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'mark',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 50,
				isOracleOrder: false,
				additionalEndPriceBuffer: new BN(100),
			});

			expect(ENUM_UTILS.toStr(result.orderType)).to.equal(
				ENUM_UTILS.toStr(OrderType.MARKET)
			);
			expect(result.auctionStartPrice?.toString()).to.equal('100000000');
			expect(result.auctionEndPrice?.toString()).to.equal('108000100');
			//@ts-ignore
			expect(result.constrainedBySlippage).to.equal(false);
		});
	});
	describe('deriveMarketOrderParams max leverage sizing', () => {
		it('uses maxLeverageOrderSize as baseAssetAmount when maxLeverageSelected is true', () => {
			const maxLeverageOrderSize = new BN(1000).mul(BASE_PRECISION);

			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: true,
				maxLeverageOrderSize,
				baseAmount: new BN(1).mul(BASE_PRECISION),
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(100).mul(PRICE_PRECISION),
				worstPrice: new BN(101).mul(PRICE_PRECISION),
				markPrice: new BN(100).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'entry',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 0.5,
				isOracleOrder: false,
			});

			expect(result.baseAssetAmount.toString()).to.equal(
				maxLeverageOrderSize.toString()
			);
		});

		it('uses the requested baseAmount when maxLeverageSelected is false', () => {
			const baseAmount = new BN(1).mul(BASE_PRECISION);

			const result = deriveMarketOrderParams({
				marketType: MarketType.PERP,
				marketIndex: 0,
				direction: PositionDirection.LONG,
				maxLeverageSelected: false,
				maxLeverageOrderSize: new BN(1000).mul(BASE_PRECISION),
				baseAmount,
				reduceOnly: false,
				allowInfSlippage: false,
				bestPrice: new BN(99).mul(PRICE_PRECISION),
				entryPrice: new BN(100).mul(PRICE_PRECISION),
				oraclePrice: new BN(100).mul(PRICE_PRECISION),
				worstPrice: new BN(101).mul(PRICE_PRECISION),
				markPrice: new BN(100).mul(PRICE_PRECISION),
				auctionDuration: 20,
				auctionStartPriceOffset: 0,
				auctionEndPriceOffset: 0,
				auctionStartPriceOffsetFrom: 'entry',
				auctionEndPriceOffsetFrom: 'worst',
				slippageTolerance: 0.5,
				isOracleOrder: false,
			});

			expect(result.baseAssetAmount.toString()).to.equal(baseAmount.toString());
		});
	});

	describe('getMarketOrderLimitPrice', () => {
		it('should use the correct price for a LONG with 5% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 5,
			});

			expect(result.toString()).to.equal('105000000');
		});

		it('should use the correct price for a SHORT with 5% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 5,
			});

			expect(result.toString()).to.equal('95000000');
		});
		it('should use the correct price for a LONG with 0.5% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.5,
			});

			expect(result.toString()).to.equal('100500000');
		});

		it('should use the correct price for a SHORT with 0.5% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.5,
			});

			expect(result.toString()).to.equal('99500000');
		});
		it('should use the correct price for a LONG with 0.05% max slippage', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.LONG,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.05,
			});

			expect(result.toString()).to.equal('100050000');
		});

		it('should use the correct price for a SHORT with 0.05% max slippage ', () => {
			const result = getMarketOrderLimitPrice({
				direction: PositionDirection.SHORT,
				baselinePrice: new BN(100).mul(PRICE_PRECISION),
				slippageTolerance: 0.05,
			});

			expect(result.toString()).to.equal('99950000');
		});
	});
});

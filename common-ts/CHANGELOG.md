# Changelog

## [0.4.0](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.3.1...common-ts-v0.4.0) (2026-07-23)


### Features

* **common-ts:** widen vAMM fallback auction end by 0.1% of oracle ([#387](https://github.com/velocity-exchange/velocity-common/issues/387)) ([79d7507](https://github.com/velocity-exchange/velocity-common/commit/79d7507e59b2dc411d8063893a03b27e32f916f1))

## [0.3.1](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.3.0...common-ts-v0.3.1) (2026-07-23)


### Bug Fixes

* **common-ts:** resolve default auction duration in fallback tiers ([a2d247a](https://github.com/velocity-exchange/velocity-common/commit/a2d247a318575fc218e616ad546457a6c8401edb))

## [0.3.0](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.2.1...common-ts-v0.3.0) (2026-07-22)


### Features

* **common-ts:** DLOB-independent vAMM fallback for perp auction params ([#385](https://github.com/velocity-exchange/velocity-common/issues/385)) ([fe8a661](https://github.com/velocity-exchange/velocity-common/commit/fe8a661d7758e1f7ba5e8538cda8ca51fc7a4f5f))


### Code Refactoring

* **common-ts:** remove lp-records from DownloadRecordType ([0dafed5](https://github.com/velocity-exchange/velocity-common/commit/0dafed565439ba580d34a59cedce26f4dbb3ffc0))

## [0.2.1](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.2.0...common-ts-v0.2.1) (2026-07-11)


### Code Refactoring

* **common-ts:** update auction params response ([4c29a65](https://github.com/velocity-exchange/velocity-common/commit/4c29a65fda6f0dab7194d4e9eaed6f24293ee531))

## [0.2.0](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.6...common-ts-v0.2.0) (2026-07-09)


### Features

* **common-ts:** add version parameter to auction params and callback for fetched auction params ([ae6a737](https://github.com/velocity-exchange/velocity-common/commit/ae6a73734d493015ea6f2b1acafd0f752cb065c1))

## [0.1.6](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.5...common-ts-v0.1.6) (2026-07-05)


### Code Refactoring

* **common-ts:** remove historyServerUrl from EnvironmentConstants ([189ea46](https://github.com/velocity-exchange/velocity-common/commit/189ea4675b72a337d8d2f2dd96e0d9841878be9d))
* **common-ts:** rename USDC to USDT ([d476fcb](https://github.com/velocity-exchange/velocity-common/commit/d476fcb3092593c846e89ee211f3f1c20057b527))
* **common-ts:** replace console logging with logger utility for improved log management ([#381](https://github.com/velocity-exchange/velocity-common/issues/381)) ([7709504](https://github.com/velocity-exchange/velocity-common/commit/7709504c16159b7a9106af7e3404c0f10021117a))
* **common-ts:** update bun.lock ([fd7d199](https://github.com/velocity-exchange/velocity-common/commit/fd7d19915e944266018e7104b819cf04e5215578))

## [0.1.5](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.4...common-ts-v0.1.5) (2026-06-30)


### Code Refactoring

* **common-ts:** fix dependencies ([1c0a99a](https://github.com/velocity-exchange/velocity-common/commit/1c0a99a474754a336380ef80edd18731caf63bd4))
* **common-ts:** update endpoints for events and swift servers ([b980090](https://github.com/velocity-exchange/velocity-common/commit/b980090386813ae17da62c3a138b351ef07efe72))
* **common-ts:** update triton rpc endpoints ([a4de0c2](https://github.com/velocity-exchange/velocity-common/commit/a4de0c26f07f8b46f3141ab392e1cdd4a97ae6bf))

## [0.1.4](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.3...common-ts-v0.1.4) (2026-06-26)


### Code Refactoring

* **common-ts:** configurable url inputs ([#376](https://github.com/velocity-exchange/velocity-common/issues/376)) ([3ffa08a](https://github.com/velocity-exchange/velocity-common/commit/3ffa08aca7017d7d5e9d2e01065bdb3d64c16325))

## [0.1.3](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.2...common-ts-v0.1.3) (2026-06-25)


### Code Refactoring

* **common-ts:** update data api domain ([f37398d](https://github.com/velocity-exchange/velocity-common/commit/f37398d6609d05c839d3b3a38222fa90e5daf4d4))

## [0.1.2](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.1...common-ts-v0.1.2) (2026-06-24)


### Bug Fixes

* **common-ts:** attach taker escrow for builder-code place-and-take orders ([4837057](https://github.com/velocity-exchange/velocity-common/commit/4837057c180533a57896befc9b419209e4d6fd68))


### Code Refactoring

* **common-ts:** update server endpoints ([8b287e5](https://github.com/velocity-exchange/velocity-common/commit/8b287e5992847a4cd610ca8e662efddfc76b2f7c))

## [0.1.1](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.1.0...common-ts-v0.1.1) (2026-06-24)


### Code Refactoring

* **common-ts:** update referral model ([ae78748](https://github.com/velocity-exchange/velocity-common/commit/ae78748a8dddea1a49be20c8cac32f09f7edecef))

## [0.1.0](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.0.5...common-ts-v0.1.0) (2026-06-23)


### Features

* **common-ts:** add createTransferCollateralIx and createReferralLinkIx ([592c59f](https://github.com/velocity-exchange/velocity-common/commit/592c59fafc5d6ca394a5c8271f9366774f9023d2))


### Code Refactoring

* **common-ts:** clean up HLM ([40ac493](https://github.com/velocity-exchange/velocity-common/commit/40ac4936d51367f35e305261931ab41f7959e128))
* **common-ts:** clean up prediction markets ([c0f83db](https://github.com/velocity-exchange/velocity-common/commit/c0f83db6ddf50b96702e8d95e6d689b24777f565))
* **common-ts:** cleanup lpshares, quoteAssetamount ([4f060d8](https://github.com/velocity-exchange/velocity-common/commit/4f060d8e75c0d9ef9eb2826e6d8698f0b81691a4))
* **common-ts:** update @velocity-exchange/sdk to 0.2.4 and reconcile ([#367](https://github.com/velocity-exchange/velocity-common/issues/367)) ([536b583](https://github.com/velocity-exchange/velocity-common/commit/536b583390a698fad86e373795dd5182708f71f8))

## [0.0.5](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.0.4...common-ts-v0.0.5) (2026-06-19)


### Code Refactoring

* **common-ts:** clean up UIMarket ([e028688](https://github.com/velocity-exchange/velocity-common/commit/e028688f2e2eac19515c3d54796d78863d3d835e))
* fix sdk renames ([#359](https://github.com/velocity-exchange/velocity-common/issues/359)) ([4ddb38a](https://github.com/velocity-exchange/velocity-common/commit/4ddb38a207df762ac525bea07a5254a774f2a920))

## [0.0.4](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.0.3...common-ts-v0.0.4) (2026-06-19)


### Code Refactoring

* **common-ts:** remove dead code & cruft from drift cluster ([#357](https://github.com/velocity-exchange/velocity-common/issues/357)) ([72af2a3](https://github.com/velocity-exchange/velocity-common/commit/72af2a33bd1e0a11381658968787d62cfbc47637))
* **common-ts:** simplify clients (safe subset) ([#355](https://github.com/velocity-exchange/velocity-common/issues/355)) ([d23e6fc](https://github.com/velocity-exchange/velocity-common/commit/d23e6fc0b459e0f300dd7dd7f1c83735ccac90e6))
* **common-ts:** simplify domain utils cluster + fix latent bugs ([#353](https://github.com/velocity-exchange/velocity-common/issues/353)) ([da5e583](https://github.com/velocity-exchange/velocity-common/commit/da5e58374b5fc8c15b3a34cd8567a757c523ac14))
* **common-ts:** simplify pure utils cluster + fix latent bugs ([#352](https://github.com/velocity-exchange/velocity-common/issues/352)) ([ad5d6c3](https://github.com/velocity-exchange/velocity-common/commit/ad5d6c32ac9187e0917eb35d80cfebba2f4d8832))
* **common-ts:** simplify types & serializableTypes (safe subset) ([#356](https://github.com/velocity-exchange/velocity-common/issues/356)) ([09de9ed](https://github.com/velocity-exchange/velocity-common/commit/09de9ede85ecce1e2b2bed25c029019fbb0f55f5))
* **common-ts:** tidy infra utils (safe subset) ([#354](https://github.com/velocity-exchange/velocity-common/issues/354)) ([27754d7](https://github.com/velocity-exchange/velocity-common/commit/27754d7620c55b2dcbcb94750b60eb8b0743ee4c))

## [0.0.3](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v0.0.2...common-ts-v0.0.3) (2026-06-01)


### Features

* better buffer iso deposit buffer ([#301](https://github.com/velocity-exchange/velocity-common/issues/301)) ([7307035](https://github.com/velocity-exchange/velocity-common/commit/7307035e10beb38d679df31309c08c7be44b5931))
* better naming + commenting on iso deposit buffer var ([#302](https://github.com/velocity-exchange/velocity-common/issues/302)) ([772d60f](https://github.com/velocity-exchange/velocity-common/commit/772d60fdb28bcd83f354de2c87a65a72239e6dfa))
* bigger buffer on iso pos top ups ([#303](https://github.com/velocity-exchange/velocity-common/issues/303)) ([dddb37a](https://github.com/velocity-exchange/velocity-common/commit/dddb37a1c9d5e4aec9d2aff1e8a1ce10b0f05fb4))
* bump node to 22 ([fdd2220](https://github.com/velocity-exchange/velocity-common/commit/fdd2220b03c7f05be966fafa3eb074ef9cb64851))
* bump sdk on react and more ([#307](https://github.com/velocity-exchange/velocity-common/issues/307)) ([8932581](https://github.com/velocity-exchange/velocity-common/commit/89325814e7f991cdfa47a0a15432a5074964d00d))
* **common-ts:** add builder code ([#264](https://github.com/velocity-exchange/velocity-common/issues/264)) ([42e577d](https://github.com/velocity-exchange/velocity-common/commit/42e577dc51c7e2a69cd14d69cf14865a9b0fe620))
* **common-ts:** add builder codes methods to CentralServerDrift ([#318](https://github.com/velocity-exchange/velocity-common/issues/318)) ([1ad8fda](https://github.com/velocity-exchange/velocity-common/commit/1ad8fda78b44b7181f55406e5645813621c34f7f))
* **common-ts:** add custom max margin ratio for markets ([40dfe83](https://github.com/velocity-exchange/velocity-common/commit/40dfe83251eee2556ebf15649b14f4f9eb8047a4))
* **common-ts:** add getUserMaxLeverageForMarket ([f3571c1](https://github.com/velocity-exchange/velocity-common/commit/f3571c1b84af5a184ed8dcbafd8e9831cbcc2234))
* **common-ts:** add hidden markets list ([e8787a7](https://github.com/velocity-exchange/velocity-common/commit/e8787a71b6cb69dcd96401027b924edf7147f408))
* **common-ts:** add isOrderTriggered to ORDER_COMMON_UTILS ([#319](https://github.com/velocity-exchange/velocity-common/issues/319)) ([a6483e9](https://github.com/velocity-exchange/velocity-common/commit/a6483e97f71d158d2d55356a3f81864cffd325b5))
* **common-ts:** add logic for edit orders ([#262](https://github.com/velocity-exchange/velocity-common/issues/262)) ([5e4b27e](https://github.com/velocity-exchange/velocity-common/commit/5e4b27ebb8a07597338982462911b300ebcf52cf))
* **common-ts:** add market sizes method ([c0a4a51](https://github.com/velocity-exchange/velocity-common/commit/c0a4a51b9134c2ff226b9c059c717d0c7dd35712))
* **common-ts:** add swift account creation methods ([#317](https://github.com/velocity-exchange/velocity-common/issues/317)) ([be7bd7d](https://github.com/velocity-exchange/velocity-common/commit/be7bd7de25ee4041344646d50891967a06b21a4e))
* **common-ts:** add update market max leverage ix ([938816d](https://github.com/velocity-exchange/velocity-common/commit/938816d9ea9833f71084eb903f1e2b4a70f74533))
* deser new fields positions API ([1728299](https://github.com/velocity-exchange/velocity-common/commit/17282999f7848c33165503fe6064289982921ff0))
* deser new fields positions API ([5b264af](https://github.com/velocity-exchange/velocity-common/commit/5b264af94f08688adac17cc007b1ab445b8fcb42))
* extra fetch before expiration of swift confirm ([#288](https://github.com/velocity-exchange/velocity-common/issues/288)) ([ee7a48c](https://github.com/velocity-exchange/velocity-common/commit/ee7a48c7b944df3cb8a7f0a165398680b27e3197))
* methods on CSD that allow for convenient mngmt of iso pos ([#316](https://github.com/velocity-exchange/velocity-common/issues/316)) ([7f1a457](https://github.com/velocity-exchange/velocity-common/commit/7f1a457ddc0f1a6369665289b591a0c63c50ac10))
* minifying and browser vs node build commands ([#293](https://github.com/velocity-exchange/velocity-common/issues/293)) ([9fdcd2d](https://github.com/velocity-exchange/velocity-common/commit/9fdcd2d232e924960d585e296fd157797c8ac05b))
* more spot market index consts ([#276](https://github.com/velocity-exchange/velocity-common/issues/276)) ([7d84b6d](https://github.com/velocity-exchange/velocity-common/commit/7d84b6d1fca8ac6fa18a55d053070a071e214547))
* more spot market index consts ([#277](https://github.com/velocity-exchange/velocity-common/issues/277)) ([23b7416](https://github.com/velocity-exchange/velocity-common/commit/23b7416497bca96fe300e2d0ef363997bb8db9ae))
* pin esbuild ([1351f25](https://github.com/velocity-exchange/velocity-common/commit/1351f255555cac6bbc89000910423a453b6a950e))
* swift + network utils ([#258](https://github.com/velocity-exchange/velocity-common/issues/258)) ([f9f5049](https://github.com/velocity-exchange/velocity-common/commit/f9f5049884cfb92c1b48f3a1b9e8fe6e01284f8c))
* swift confirmation uses processed commitment ([#287](https://github.com/velocity-exchange/velocity-common/issues/287)) ([bb7a040](https://github.com/velocity-exchange/velocity-common/commit/bb7a0409202fbe85c34489c902e2830c92df64eb))
* swift max margin support + bump common and unit tests ([#251](https://github.com/velocity-exchange/velocity-common/issues/251)) ([dda8fd0](https://github.com/velocity-exchange/velocity-common/commit/dda8fd0ae93f3a1d666a3ee4330cf47b22bbb91d))


### Bug Fixes

* **common-ts:** devtools source map mapping ([9747d38](https://github.com/velocity-exchange/velocity-common/commit/9747d3859f333ef742d7424497eed91931fcc23e))
* **common-ts:** import ([9aaf7be](https://github.com/velocity-exchange/velocity-common/commit/9aaf7be36c46713db5da45a0b1454f54c2a4d568))
* **common-ts:** pass limit price in place and take ([c882c69](https://github.com/velocity-exchange/velocity-common/commit/c882c698bb3c89c3c561a942dd128d99a4f2ea78))
* **common-ts:** taker pubkey for swift delegate ([257ef1e](https://github.com/velocity-exchange/velocity-common/commit/257ef1e375efebec1761ebec88da8c332732214a))
* **common-ts:** total quote amount for bit flag calculation ([7a38a2c](https://github.com/velocity-exchange/velocity-common/commit/7a38a2cd5feb433997969fe042b19bacef6cc30b))
* incorrect sdk env mappnig ([d598f59](https://github.com/velocity-exchange/velocity-common/commit/d598f59ba3fa37ef35d856044e752e10014d74ec))
* incorrect sdk env mappnig ([ee50f0d](https://github.com/velocity-exchange/velocity-common/commit/ee50f0dcab6068f4726b65e513aaaaaf06de89ca))
* merge conflicts ([90df423](https://github.com/velocity-exchange/velocity-common/commit/90df42383b75e28cec7712cb46eed397dac6c33c))
* remove file: dependency to avoid Bun 1.3.2 isolated installs SymLinkLoop ([#280](https://github.com/velocity-exchange/velocity-common/issues/280)) ([3f46bac](https://github.com/velocity-exchange/velocity-common/commit/3f46bacbb7bd6bd6afaac5de0a63f3758c188713))
* wrong liq price for iso positions ([#304](https://github.com/velocity-exchange/velocity-common/issues/304)) ([f347968](https://github.com/velocity-exchange/velocity-common/commit/f347968eb91b8e6f22f46dc49130f5ddaf5b744a))


### Code Refactoring

* **commno-ts:** prioritize saved leverage for empty positions with no orders ([c1faade](https://github.com/velocity-exchange/velocity-common/commit/c1faadee45acb64b0983d616f0f44d2cf1c43920))
* **common-ts:** abstract dlob websocket utils into common-ts ([32c964f](https://github.com/velocity-exchange/velocity-common/commit/32c964f568e24d09ef99acf3f324d2978d264249))
* **common-ts:** abstract over oracle crank ixs processing ([#314](https://github.com/velocity-exchange/velocity-common/issues/314)) ([2750e81](https://github.com/velocity-exchange/velocity-common/commit/2750e8195044a47f900088e7ca19913a774b7b51))
* **common-ts:** add createAndDeposit for CentralServerDrift, and market ops ([a6445f0](https://github.com/velocity-exchange/velocity-common/commit/a6445f013bd1c0bcfdd83088a4592578c54c6168))
* **common-ts:** add delegate ix to create and deposit ix ([0860382](https://github.com/velocity-exchange/velocity-common/commit/08603824e6b0451f2b404a1d00bc2e44e9ee02ef))
* **common-ts:** add enable hlm for market max lev update ([733cc62](https://github.com/velocity-exchange/velocity-common/commit/733cc624163bdaf793557d0afd54c66ddc80ae07))
* **common-ts:** add getMultipleAccountsInfoChunked ([306da81](https://github.com/velocity-exchange/velocity-common/commit/306da810c8cc1203e6ceb91c422548983d782acd))
* **common-ts:** add getUserAccount to CentralServerDrift ([#255](https://github.com/velocity-exchange/velocity-common/issues/255)) ([93c3e35](https://github.com/velocity-exchange/velocity-common/commit/93c3e354ac3c93c7750ae34f2080d08088df0203))
* **common-ts:** add high leverage spots ([3341254](https://github.com/velocity-exchange/velocity-common/commit/334125498810d974338548ce407ea554a1975dd0))
* **common-ts:** add mainSignerOverride for cancel order ix ([1cada52](https://github.com/velocity-exchange/velocity-common/commit/1cada5211082d14a37c284be6f1656b9f993c3e9))
* **common-ts:** add mainSignerOverride for createSettlePnlIx ([96e33c1](https://github.com/velocity-exchange/velocity-common/commit/96e33c186d5c4b3abee4a60481e6e17f8798ad8b))
* **common-ts:** add min order size error msg ([d3081be](https://github.com/velocity-exchange/velocity-common/commit/d3081beb7d32ddaad0f4bffc737b711435ff2d3c))
* **common-ts:** add oracle limit order support for swift ([#330](https://github.com/velocity-exchange/velocity-common/issues/330)) ([2c06f6e](https://github.com/velocity-exchange/velocity-common/commit/2c06f6e5c0a0d5571d0f21d73d714f826185863c))
* **common-ts:** add signer override to update position leverage ([#290](https://github.com/velocity-exchange/velocity-common/issues/290)) ([1773313](https://github.com/velocity-exchange/velocity-common/commit/17733136b3569a5bd854dadafb7e6df4bf6cabae))
* **common-ts:** add slot back to MarketPriceState ([9b66f51](https://github.com/velocity-exchange/velocity-common/commit/9b66f51f3e5ff0305231d4813031cc8c5a79bded))
* **common-ts:** add swift options and isMaxLeverage for openPerpOrder ([#254](https://github.com/velocity-exchange/velocity-common/issues/254)) ([654a18b](https://github.com/velocity-exchange/velocity-common/commit/654a18b42a8eee398c1805529df1596455c9342d))
* **common-ts:** add swift source ([82c4b31](https://github.com/velocity-exchange/velocity-common/commit/82c4b3155c93fcdf0255514dcb20830384c6adc4))
* **common-ts:** allow authority override for orders ([d5cb9d0](https://github.com/velocity-exchange/velocity-common/commit/d5cb9d07d3422c14bf5e4dc0947de19749432987))
* **common-ts:** allow postonly limit orders for swift ([cddffe2](https://github.com/velocity-exchange/velocity-common/commit/cddffe201125b14916279052bb43ba2d606fdbae))
* **common-ts:** break barrel files ([367e0ed](https://github.com/velocity-exchange/velocity-common/commit/367e0ed836c970a3b21e6beeef9d43ea9ad293db))
* **common-ts:** clean up unused properties in OptionalAuctionParamsRequestInputs ([6b08a39](https://github.com/velocity-exchange/velocity-common/commit/6b08a39f5d3e10d1e860c018476101585ff1e3e2))
* **common-ts:** enforce positionMaxLeverage param, update getPerpOrderParamsBitFlags ([7d9a7c0](https://github.com/velocity-exchange/velocity-common/commit/7d9a7c0542edd68c2baa3b486901def99a2dc192))
* **common-ts:** expose driftCl ([549c5be](https://github.com/velocity-exchange/velocity-common/commit/549c5bef12482b3cb1e6c5bb0c53ba0a2af2d70b))
* **common-ts:** fix order type label ([03c2773](https://github.com/velocity-exchange/velocity-common/commit/03c277394e6773bc2f89412652206ebfc8622efe))
* **common-ts:** fix upstream SDK changes ([#340](https://github.com/velocity-exchange/velocity-common/issues/340)) ([0f6502b](https://github.com/velocity-exchange/velocity-common/commit/0f6502ba81262f5016dbccd6c13104ee115de4cc))
* **common-ts:** fix wallet input for swift orders ([2ef21f1](https://github.com/velocity-exchange/velocity-common/commit/2ef21f1f01b59c251fc3ffab316dd7126653e200))
* **common-ts:** fully abstract isolated positions deposit calculation ([#321](https://github.com/velocity-exchange/velocity-common/issues/321)) ([dc85782](https://github.com/velocity-exchange/velocity-common/commit/dc85782403522791c9f7162d177dfd1052300353))
* **common-ts:** getTokenAddressForDepositAndWithdraw ([7ff5800](https://github.com/velocity-exchange/velocity-common/commit/7ff5800972637794bae5c7c5965ddb20d2f964d5))
* **common-ts:** handle spot and perp limit auctions ([9e6e989](https://github.com/velocity-exchange/velocity-common/commit/9e6e9892624d474b641683bab50c8c97a5fe75cb))
* **common-ts:** handle uninitialized userstats ([7c6d9ce](https://github.com/velocity-exchange/velocity-common/commit/7c6d9ce5d70e40abe61cc2f5b6db0ffa466dc3fa))
* **common-ts:** implement getUser for CentralServerDrift ([f04dd6f](https://github.com/velocity-exchange/velocity-common/commit/f04dd6ff49cd4f2bfc0f05486ea96dffeb8dbb2d))
* **common-ts:** improve ATA getter for withdraws ([b1c68fd](https://github.com/velocity-exchange/velocity-common/commit/b1c68fd9651c2d15d4e3f8403ef7277ea6125f85))
* **common-ts:** improve delete user and add update username ix ([#323](https://github.com/velocity-exchange/velocity-common/issues/323)) ([c5c2b34](https://github.com/velocity-exchange/velocity-common/commit/c5c2b34437bce4ad502b0e59ab357376cf712095))
* **common-ts:** improve MultiplexWebsocket error handling ([211a6b8](https://github.com/velocity-exchange/velocity-common/commit/211a6b860b5b034094ecb2732fc774b18812d784))
* **common-ts:** improve orders logic ([#252](https://github.com/velocity-exchange/velocity-common/issues/252)) ([e0a87b8](https://github.com/velocity-exchange/velocity-common/commit/e0a87b84fe9abda6a6a4c603bbc3d140e8a34467))
* **common-ts:** improve swift order logic, add logging callbacks ([574d6ee](https://github.com/velocity-exchange/velocity-common/commit/574d6ee88c32688830d6f3384d5920de9eaf31d8))
* **common-ts:** improve type for getIdAndAuthorityFromKey ([71f40a2](https://github.com/velocity-exchange/velocity-common/commit/71f40a200d2094b02fa2e387539b9f75c2f9deaf))
* **common-ts:** improve typing and naming ([45ce827](https://github.com/velocity-exchange/velocity-common/commit/45ce827c7a7fe2da5545fbc88f776498f7db9ea5))
* **common-ts:** improve typings for CentralServerDrift ([0a244f1](https://github.com/velocity-exchange/velocity-common/commit/0a244f1f2296ede6fbf54841107df380a2ca0330))
* **common-ts:** integrate renamed SDK ([#342](https://github.com/velocity-exchange/velocity-common/issues/342)) ([74f0431](https://github.com/velocity-exchange/velocity-common/commit/74f0431451e4a534af9d38e8b407b23d9fc6f912))
* **common-ts:** migrate over string utils ([#326](https://github.com/velocity-exchange/velocity-common/issues/326)) ([c9ebf76](https://github.com/velocity-exchange/velocity-common/commit/c9ebf766ab98076e4952ef9fc952f5e44e42e330))
* **common-ts:** migrate to use MultiplexWebSocket ([#271](https://github.com/velocity-exchange/velocity-common/issues/271)) ([a76a50c](https://github.com/velocity-exchange/velocity-common/commit/a76a50c1e49c56f3524f0385f7a5ca9aa8a56a6e))
* **common-ts:** pass highLeverageOptions into createPlaceAndTakePerpMarketOrderIx ([05d86bb](https://github.com/velocity-exchange/velocity-common/commit/05d86bb754b0816330e8a161ee7269746613e166))
* **common-ts:** remove delisted markets from hidden markets ([6f8c379](https://github.com/velocity-exchange/velocity-common/commit/6f8c379283477e10bff1dc224f4216764f30d16e))
* **common-ts:** remove legacy code for swaps ([fc375b0](https://github.com/velocity-exchange/velocity-common/commit/fc375b0d328c41ec3d77b4f9752d28706163489c))
* **common-ts:** remove legacy lp logic ([876a5d8](https://github.com/velocity-exchange/velocity-common/commit/876a5d8c89da7d9041b3a76c06ddae5c50479106))
* **common-ts:** remove logger ([#328](https://github.com/velocity-exchange/velocity-common/issues/328)) ([231bcf2](https://github.com/velocity-exchange/velocity-common/commit/231bcf2f04b9d207ac7dfa8dd95fcdb47318c8f1))
* **common-ts:** remove triton rpc ([38a151d](https://github.com/velocity-exchange/velocity-common/commit/38a151dca3456e25f2daa2434e1bb25c52e271a2))
* **common-ts:** restructure utils into domain-based modules ([#329](https://github.com/velocity-exchange/velocity-common/issues/329)) ([fe67e94](https://github.com/velocity-exchange/velocity-common/commit/fe67e94384e307b08d5f0bf69d8a863aea70fbe1))
* **common-ts:** return SWIFT message from CentralServerDrift ([#320](https://github.com/velocity-exchange/velocity-common/issues/320)) ([e115e6b](https://github.com/velocity-exchange/velocity-common/commit/e115e6bdfa78c3cb2c95d3eba6b1b2076ddf04fa))
* **common-ts:** switch active user ([f97bf51](https://github.com/velocity-exchange/velocity-common/commit/f97bf51e387261bb2dc810e6e0bf90b9c8d0482e))
* **common-ts:** update gov if vault max apr ([f6397de](https://github.com/velocity-exchange/velocity-common/commit/f6397de2350c3cfb49a1d30f71b6ce28a3553618))
* **common-ts:** update hidden markets ([a168b92](https://github.com/velocity-exchange/velocity-common/commit/a168b92e2b9017b712d4e6a59faa256345546c05))
* **common-ts:** update hidden perps list ([37d156a](https://github.com/velocity-exchange/velocity-common/commit/37d156afb2d74356bad3053891a9bc1434822e41))
* **common-ts:** update LiquidityType ([c4b84f9](https://github.com/velocity-exchange/velocity-common/commit/c4b84f94d8dded96e2324657709b8f95a88f1631))
* **common-ts:** update RPCs ([f1fed1d](https://github.com/velocity-exchange/velocity-common/commit/f1fed1dc877f05e4405b895a2eb8f6b6ba036b1a))
* **common-ts:** update SwiftOrderOptions ([4dca763](https://github.com/velocity-exchange/velocity-common/commit/4dca76303f284beb9cf7cfe11a577197fd503bbd))
* **common-ts:** use confirmed slot for swift order prep ([e5517c0](https://github.com/velocity-exchange/velocity-common/commit/e5517c0dbe745ae3c65b5fbbe475fcfb5253576d))
* **common-ts:** use Timer return type ([c64bc8e](https://github.com/velocity-exchange/velocity-common/commit/c64bc8e18a22c84e6bb7511d15177155bdf9e423))
* **ui:** add mutex to CentralServerDrift ([ebe78ca](https://github.com/velocity-exchange/velocity-common/commit/ebe78cae44aa9b0b4314cc00ea0a66f7787fa3b9))
* **ui:** add reduce only as main param, remove redundant params in createMultipleOpenPerpNonMarketOrderIx ([999d248](https://github.com/velocity-exchange/velocity-common/commit/999d24840e1f0d93e109d3a8ce94f2e97ccdef24))
* update react package.json ([d60d436](https://github.com/velocity-exchange/velocity-common/commit/d60d4365f36f33cddd00c3a856659cb8bc94320f))


### Miscellaneous

* release common-ts 0.0.3 ([b6ab786](https://github.com/velocity-exchange/velocity-common/commit/b6ab7861f9614c6d7ae6a31e9ea4b6434186b0b1))

## [1.1.1](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v1.1.0...common-ts-v1.1.1) (2026-05-18)


### Code Refactoring

* **common-ts:** fix upstream SDK changes ([#340](https://github.com/velocity-exchange/velocity-common/issues/340)) ([0f6502b](https://github.com/velocity-exchange/velocity-common/commit/0f6502ba81262f5016dbccd6c13104ee115de4cc))

## [1.1.0](https://github.com/velocity-exchange/velocity-common/compare/common-ts-v1.0.63...common-ts-v1.1.0) (2026-05-15)


### Features

* better buffer iso deposit buffer ([#301](https://github.com/velocity-exchange/velocity-common/issues/301)) ([7307035](https://github.com/velocity-exchange/velocity-common/commit/7307035e10beb38d679df31309c08c7be44b5931))
* better naming + commenting on iso deposit buffer var ([#302](https://github.com/velocity-exchange/velocity-common/issues/302)) ([772d60f](https://github.com/velocity-exchange/velocity-common/commit/772d60fdb28bcd83f354de2c87a65a72239e6dfa))
* bigger buffer on iso pos top ups ([#303](https://github.com/velocity-exchange/velocity-common/issues/303)) ([dddb37a](https://github.com/velocity-exchange/velocity-common/commit/dddb37a1c9d5e4aec9d2aff1e8a1ce10b0f05fb4))
* bump node to 22 ([fdd2220](https://github.com/velocity-exchange/velocity-common/commit/fdd2220b03c7f05be966fafa3eb074ef9cb64851))
* bump sdk on react and more ([#307](https://github.com/velocity-exchange/velocity-common/issues/307)) ([8932581](https://github.com/velocity-exchange/velocity-common/commit/89325814e7f991cdfa47a0a15432a5074964d00d))
* **common-ts:** add builder code ([#264](https://github.com/velocity-exchange/velocity-common/issues/264)) ([42e577d](https://github.com/velocity-exchange/velocity-common/commit/42e577dc51c7e2a69cd14d69cf14865a9b0fe620))
* **common-ts:** add builder codes methods to CentralServerDrift ([#318](https://github.com/velocity-exchange/velocity-common/issues/318)) ([1ad8fda](https://github.com/velocity-exchange/velocity-common/commit/1ad8fda78b44b7181f55406e5645813621c34f7f))
* **common-ts:** add custom max margin ratio for markets ([40dfe83](https://github.com/velocity-exchange/velocity-common/commit/40dfe83251eee2556ebf15649b14f4f9eb8047a4))
* **common-ts:** add getUserMaxLeverageForMarket ([f3571c1](https://github.com/velocity-exchange/velocity-common/commit/f3571c1b84af5a184ed8dcbafd8e9831cbcc2234))
* **common-ts:** add hidden markets list ([e8787a7](https://github.com/velocity-exchange/velocity-common/commit/e8787a71b6cb69dcd96401027b924edf7147f408))
* **common-ts:** add isOrderTriggered to ORDER_COMMON_UTILS ([#319](https://github.com/velocity-exchange/velocity-common/issues/319)) ([a6483e9](https://github.com/velocity-exchange/velocity-common/commit/a6483e97f71d158d2d55356a3f81864cffd325b5))
* **common-ts:** add logic for edit orders ([#262](https://github.com/velocity-exchange/velocity-common/issues/262)) ([5e4b27e](https://github.com/velocity-exchange/velocity-common/commit/5e4b27ebb8a07597338982462911b300ebcf52cf))
* **common-ts:** add market sizes method ([c0a4a51](https://github.com/velocity-exchange/velocity-common/commit/c0a4a51b9134c2ff226b9c059c717d0c7dd35712))
* **common-ts:** add swift account creation methods ([#317](https://github.com/velocity-exchange/velocity-common/issues/317)) ([be7bd7d](https://github.com/velocity-exchange/velocity-common/commit/be7bd7de25ee4041344646d50891967a06b21a4e))
* **common-ts:** add update market max leverage ix ([938816d](https://github.com/velocity-exchange/velocity-common/commit/938816d9ea9833f71084eb903f1e2b4a70f74533))
* deser new fields positions API ([1728299](https://github.com/velocity-exchange/velocity-common/commit/17282999f7848c33165503fe6064289982921ff0))
* deser new fields positions API ([5b264af](https://github.com/velocity-exchange/velocity-common/commit/5b264af94f08688adac17cc007b1ab445b8fcb42))
* extra fetch before expiration of swift confirm ([#288](https://github.com/velocity-exchange/velocity-common/issues/288)) ([ee7a48c](https://github.com/velocity-exchange/velocity-common/commit/ee7a48c7b944df3cb8a7f0a165398680b27e3197))
* methods on CSD that allow for convenient mngmt of iso pos ([#316](https://github.com/velocity-exchange/velocity-common/issues/316)) ([7f1a457](https://github.com/velocity-exchange/velocity-common/commit/7f1a457ddc0f1a6369665289b591a0c63c50ac10))
* minifying and browser vs node build commands ([#293](https://github.com/velocity-exchange/velocity-common/issues/293)) ([9fdcd2d](https://github.com/velocity-exchange/velocity-common/commit/9fdcd2d232e924960d585e296fd157797c8ac05b))
* more spot market index consts ([#276](https://github.com/velocity-exchange/velocity-common/issues/276)) ([7d84b6d](https://github.com/velocity-exchange/velocity-common/commit/7d84b6d1fca8ac6fa18a55d053070a071e214547))
* more spot market index consts ([#277](https://github.com/velocity-exchange/velocity-common/issues/277)) ([23b7416](https://github.com/velocity-exchange/velocity-common/commit/23b7416497bca96fe300e2d0ef363997bb8db9ae))
* pin esbuild ([1351f25](https://github.com/velocity-exchange/velocity-common/commit/1351f255555cac6bbc89000910423a453b6a950e))
* swift + network utils ([#258](https://github.com/velocity-exchange/velocity-common/issues/258)) ([f9f5049](https://github.com/velocity-exchange/velocity-common/commit/f9f5049884cfb92c1b48f3a1b9e8fe6e01284f8c))
* swift confirmation uses processed commitment ([#287](https://github.com/velocity-exchange/velocity-common/issues/287)) ([bb7a040](https://github.com/velocity-exchange/velocity-common/commit/bb7a0409202fbe85c34489c902e2830c92df64eb))
* swift max margin support + bump common and unit tests ([#251](https://github.com/velocity-exchange/velocity-common/issues/251)) ([dda8fd0](https://github.com/velocity-exchange/velocity-common/commit/dda8fd0ae93f3a1d666a3ee4330cf47b22bbb91d))


### Bug Fixes

* **common-ts:** devtools source map mapping ([9747d38](https://github.com/velocity-exchange/velocity-common/commit/9747d3859f333ef742d7424497eed91931fcc23e))
* **common-ts:** import ([9aaf7be](https://github.com/velocity-exchange/velocity-common/commit/9aaf7be36c46713db5da45a0b1454f54c2a4d568))
* **common-ts:** pass limit price in place and take ([c882c69](https://github.com/velocity-exchange/velocity-common/commit/c882c698bb3c89c3c561a942dd128d99a4f2ea78))
* **common-ts:** taker pubkey for swift delegate ([257ef1e](https://github.com/velocity-exchange/velocity-common/commit/257ef1e375efebec1761ebec88da8c332732214a))
* **common-ts:** total quote amount for bit flag calculation ([7a38a2c](https://github.com/velocity-exchange/velocity-common/commit/7a38a2cd5feb433997969fe042b19bacef6cc30b))
* incorrect sdk env mappnig ([d598f59](https://github.com/velocity-exchange/velocity-common/commit/d598f59ba3fa37ef35d856044e752e10014d74ec))
* incorrect sdk env mappnig ([ee50f0d](https://github.com/velocity-exchange/velocity-common/commit/ee50f0dcab6068f4726b65e513aaaaaf06de89ca))
* merge conflicts ([90df423](https://github.com/velocity-exchange/velocity-common/commit/90df42383b75e28cec7712cb46eed397dac6c33c))
* remove file: dependency to avoid Bun 1.3.2 isolated installs SymLinkLoop ([#280](https://github.com/velocity-exchange/velocity-common/issues/280)) ([3f46bac](https://github.com/velocity-exchange/velocity-common/commit/3f46bacbb7bd6bd6afaac5de0a63f3758c188713))
* wrong liq price for iso positions ([#304](https://github.com/velocity-exchange/velocity-common/issues/304)) ([f347968](https://github.com/velocity-exchange/velocity-common/commit/f347968eb91b8e6f22f46dc49130f5ddaf5b744a))


### Code Refactoring

* **commno-ts:** prioritize saved leverage for empty positions with no orders ([c1faade](https://github.com/velocity-exchange/velocity-common/commit/c1faadee45acb64b0983d616f0f44d2cf1c43920))
* **common-ts:** abstract dlob websocket utils into common-ts ([32c964f](https://github.com/velocity-exchange/velocity-common/commit/32c964f568e24d09ef99acf3f324d2978d264249))
* **common-ts:** abstract over oracle crank ixs processing ([#314](https://github.com/velocity-exchange/velocity-common/issues/314)) ([2750e81](https://github.com/velocity-exchange/velocity-common/commit/2750e8195044a47f900088e7ca19913a774b7b51))
* **common-ts:** add createAndDeposit for CentralServerDrift, and market ops ([a6445f0](https://github.com/velocity-exchange/velocity-common/commit/a6445f013bd1c0bcfdd83088a4592578c54c6168))
* **common-ts:** add delegate ix to create and deposit ix ([0860382](https://github.com/velocity-exchange/velocity-common/commit/08603824e6b0451f2b404a1d00bc2e44e9ee02ef))
* **common-ts:** add enable hlm for market max lev update ([733cc62](https://github.com/velocity-exchange/velocity-common/commit/733cc624163bdaf793557d0afd54c66ddc80ae07))
* **common-ts:** add getMultipleAccountsInfoChunked ([306da81](https://github.com/velocity-exchange/velocity-common/commit/306da810c8cc1203e6ceb91c422548983d782acd))
* **common-ts:** add getUserAccount to CentralServerDrift ([#255](https://github.com/velocity-exchange/velocity-common/issues/255)) ([93c3e35](https://github.com/velocity-exchange/velocity-common/commit/93c3e354ac3c93c7750ae34f2080d08088df0203))
* **common-ts:** add high leverage spots ([3341254](https://github.com/velocity-exchange/velocity-common/commit/334125498810d974338548ce407ea554a1975dd0))
* **common-ts:** add mainSignerOverride for cancel order ix ([1cada52](https://github.com/velocity-exchange/velocity-common/commit/1cada5211082d14a37c284be6f1656b9f993c3e9))
* **common-ts:** add mainSignerOverride for createSettlePnlIx ([96e33c1](https://github.com/velocity-exchange/velocity-common/commit/96e33c186d5c4b3abee4a60481e6e17f8798ad8b))
* **common-ts:** add min order size error msg ([d3081be](https://github.com/velocity-exchange/velocity-common/commit/d3081beb7d32ddaad0f4bffc737b711435ff2d3c))
* **common-ts:** add oracle limit order support for swift ([#330](https://github.com/velocity-exchange/velocity-common/issues/330)) ([2c06f6e](https://github.com/velocity-exchange/velocity-common/commit/2c06f6e5c0a0d5571d0f21d73d714f826185863c))
* **common-ts:** add signer override to update position leverage ([#290](https://github.com/velocity-exchange/velocity-common/issues/290)) ([1773313](https://github.com/velocity-exchange/velocity-common/commit/17733136b3569a5bd854dadafb7e6df4bf6cabae))
* **common-ts:** add slot back to MarketPriceState ([9b66f51](https://github.com/velocity-exchange/velocity-common/commit/9b66f51f3e5ff0305231d4813031cc8c5a79bded))
* **common-ts:** add swift options and isMaxLeverage for openPerpOrder ([#254](https://github.com/velocity-exchange/velocity-common/issues/254)) ([654a18b](https://github.com/velocity-exchange/velocity-common/commit/654a18b42a8eee398c1805529df1596455c9342d))
* **common-ts:** add swift source ([82c4b31](https://github.com/velocity-exchange/velocity-common/commit/82c4b3155c93fcdf0255514dcb20830384c6adc4))
* **common-ts:** allow authority override for orders ([d5cb9d0](https://github.com/velocity-exchange/velocity-common/commit/d5cb9d07d3422c14bf5e4dc0947de19749432987))
* **common-ts:** allow postonly limit orders for swift ([cddffe2](https://github.com/velocity-exchange/velocity-common/commit/cddffe201125b14916279052bb43ba2d606fdbae))
* **common-ts:** break barrel files ([367e0ed](https://github.com/velocity-exchange/velocity-common/commit/367e0ed836c970a3b21e6beeef9d43ea9ad293db))
* **common-ts:** clean up unused properties in OptionalAuctionParamsRequestInputs ([6b08a39](https://github.com/velocity-exchange/velocity-common/commit/6b08a39f5d3e10d1e860c018476101585ff1e3e2))
* **common-ts:** enforce positionMaxLeverage param, update getPerpOrderParamsBitFlags ([7d9a7c0](https://github.com/velocity-exchange/velocity-common/commit/7d9a7c0542edd68c2baa3b486901def99a2dc192))
* **common-ts:** expose driftCl ([549c5be](https://github.com/velocity-exchange/velocity-common/commit/549c5bef12482b3cb1e6c5bb0c53ba0a2af2d70b))
* **common-ts:** fix order type label ([03c2773](https://github.com/velocity-exchange/velocity-common/commit/03c277394e6773bc2f89412652206ebfc8622efe))
* **common-ts:** fix wallet input for swift orders ([2ef21f1](https://github.com/velocity-exchange/velocity-common/commit/2ef21f1f01b59c251fc3ffab316dd7126653e200))
* **common-ts:** fully abstract isolated positions deposit calculation ([#321](https://github.com/velocity-exchange/velocity-common/issues/321)) ([dc85782](https://github.com/velocity-exchange/velocity-common/commit/dc85782403522791c9f7162d177dfd1052300353))
* **common-ts:** getTokenAddressForDepositAndWithdraw ([7ff5800](https://github.com/velocity-exchange/velocity-common/commit/7ff5800972637794bae5c7c5965ddb20d2f964d5))
* **common-ts:** handle spot and perp limit auctions ([9e6e989](https://github.com/velocity-exchange/velocity-common/commit/9e6e9892624d474b641683bab50c8c97a5fe75cb))
* **common-ts:** handle uninitialized userstats ([7c6d9ce](https://github.com/velocity-exchange/velocity-common/commit/7c6d9ce5d70e40abe61cc2f5b6db0ffa466dc3fa))
* **common-ts:** implement getUser for CentralServerDrift ([f04dd6f](https://github.com/velocity-exchange/velocity-common/commit/f04dd6ff49cd4f2bfc0f05486ea96dffeb8dbb2d))
* **common-ts:** improve ATA getter for withdraws ([b1c68fd](https://github.com/velocity-exchange/velocity-common/commit/b1c68fd9651c2d15d4e3f8403ef7277ea6125f85))
* **common-ts:** improve delete user and add update username ix ([#323](https://github.com/velocity-exchange/velocity-common/issues/323)) ([c5c2b34](https://github.com/velocity-exchange/velocity-common/commit/c5c2b34437bce4ad502b0e59ab357376cf712095))
* **common-ts:** improve MultiplexWebsocket error handling ([211a6b8](https://github.com/velocity-exchange/velocity-common/commit/211a6b860b5b034094ecb2732fc774b18812d784))
* **common-ts:** improve orders logic ([#252](https://github.com/velocity-exchange/velocity-common/issues/252)) ([e0a87b8](https://github.com/velocity-exchange/velocity-common/commit/e0a87b84fe9abda6a6a4c603bbc3d140e8a34467))
* **common-ts:** improve swift order logic, add logging callbacks ([574d6ee](https://github.com/velocity-exchange/velocity-common/commit/574d6ee88c32688830d6f3384d5920de9eaf31d8))
* **common-ts:** improve type for getIdAndAuthorityFromKey ([71f40a2](https://github.com/velocity-exchange/velocity-common/commit/71f40a200d2094b02fa2e387539b9f75c2f9deaf))
* **common-ts:** improve typing and naming ([45ce827](https://github.com/velocity-exchange/velocity-common/commit/45ce827c7a7fe2da5545fbc88f776498f7db9ea5))
* **common-ts:** improve typings for CentralServerDrift ([0a244f1](https://github.com/velocity-exchange/velocity-common/commit/0a244f1f2296ede6fbf54841107df380a2ca0330))
* **common-ts:** migrate over string utils ([#326](https://github.com/velocity-exchange/velocity-common/issues/326)) ([c9ebf76](https://github.com/velocity-exchange/velocity-common/commit/c9ebf766ab98076e4952ef9fc952f5e44e42e330))
* **common-ts:** migrate to use MultiplexWebSocket ([#271](https://github.com/velocity-exchange/velocity-common/issues/271)) ([a76a50c](https://github.com/velocity-exchange/velocity-common/commit/a76a50c1e49c56f3524f0385f7a5ca9aa8a56a6e))
* **common-ts:** pass highLeverageOptions into createPlaceAndTakePerpMarketOrderIx ([05d86bb](https://github.com/velocity-exchange/velocity-common/commit/05d86bb754b0816330e8a161ee7269746613e166))
* **common-ts:** remove delisted markets from hidden markets ([6f8c379](https://github.com/velocity-exchange/velocity-common/commit/6f8c379283477e10bff1dc224f4216764f30d16e))
* **common-ts:** remove legacy code for swaps ([fc375b0](https://github.com/velocity-exchange/velocity-common/commit/fc375b0d328c41ec3d77b4f9752d28706163489c))
* **common-ts:** remove legacy lp logic ([876a5d8](https://github.com/velocity-exchange/velocity-common/commit/876a5d8c89da7d9041b3a76c06ddae5c50479106))
* **common-ts:** remove logger ([#328](https://github.com/velocity-exchange/velocity-common/issues/328)) ([231bcf2](https://github.com/velocity-exchange/velocity-common/commit/231bcf2f04b9d207ac7dfa8dd95fcdb47318c8f1))
* **common-ts:** remove triton rpc ([38a151d](https://github.com/velocity-exchange/velocity-common/commit/38a151dca3456e25f2daa2434e1bb25c52e271a2))
* **common-ts:** restructure utils into domain-based modules ([#329](https://github.com/velocity-exchange/velocity-common/issues/329)) ([fe67e94](https://github.com/velocity-exchange/velocity-common/commit/fe67e94384e307b08d5f0bf69d8a863aea70fbe1))
* **common-ts:** return SWIFT message from CentralServerDrift ([#320](https://github.com/velocity-exchange/velocity-common/issues/320)) ([e115e6b](https://github.com/velocity-exchange/velocity-common/commit/e115e6bdfa78c3cb2c95d3eba6b1b2076ddf04fa))
* **common-ts:** switch active user ([f97bf51](https://github.com/velocity-exchange/velocity-common/commit/f97bf51e387261bb2dc810e6e0bf90b9c8d0482e))
* **common-ts:** update gov if vault max apr ([f6397de](https://github.com/velocity-exchange/velocity-common/commit/f6397de2350c3cfb49a1d30f71b6ce28a3553618))
* **common-ts:** update hidden markets ([a168b92](https://github.com/velocity-exchange/velocity-common/commit/a168b92e2b9017b712d4e6a59faa256345546c05))
* **common-ts:** update hidden perps list ([37d156a](https://github.com/velocity-exchange/velocity-common/commit/37d156afb2d74356bad3053891a9bc1434822e41))
* **common-ts:** update LiquidityType ([c4b84f9](https://github.com/velocity-exchange/velocity-common/commit/c4b84f94d8dded96e2324657709b8f95a88f1631))
* **common-ts:** update RPCs ([f1fed1d](https://github.com/velocity-exchange/velocity-common/commit/f1fed1dc877f05e4405b895a2eb8f6b6ba036b1a))
* **common-ts:** update SwiftOrderOptions ([4dca763](https://github.com/velocity-exchange/velocity-common/commit/4dca76303f284beb9cf7cfe11a577197fd503bbd))
* **common-ts:** use confirmed slot for swift order prep ([e5517c0](https://github.com/velocity-exchange/velocity-common/commit/e5517c0dbe745ae3c65b5fbbe475fcfb5253576d))
* **common-ts:** use Timer return type ([c64bc8e](https://github.com/velocity-exchange/velocity-common/commit/c64bc8e18a22c84e6bb7511d15177155bdf9e423))
* **ui:** add mutex to CentralServerDrift ([ebe78ca](https://github.com/velocity-exchange/velocity-common/commit/ebe78cae44aa9b0b4314cc00ea0a66f7787fa3b9))
* **ui:** add reduce only as main param, remove redundant params in createMultipleOpenPerpNonMarketOrderIx ([999d248](https://github.com/velocity-exchange/velocity-common/commit/999d24840e1f0d93e109d3a8ce94f2e97ccdef24))
* update react package.json ([d60d436](https://github.com/velocity-exchange/velocity-common/commit/d60d4365f36f33cddd00c3a856659cb8bc94320f))

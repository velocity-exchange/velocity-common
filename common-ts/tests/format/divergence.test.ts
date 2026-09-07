import { expect } from 'chai';
import { CorpusCase, runCorpus } from './divergence';

const agreeing = (key: string): CorpusCase => ({
	key,
	legacy: () => 'same',
	next: () => 'same',
});

describe('the characterization corpus runner', () => {
	it('passes when every case agrees and nothing is annotated', () => {
		runCorpus([agreeing('a'), agreeing('b')], {});
	});

	it('fails on a disagreement that is not listed', () => {
		expect(() =>
			runCorpus([{ key: 'a', legacy: () => 'old', next: () => 'new' }], {})
		).to.throw(/a must be unchanged/);
	});

	it('fails on a listed divergence the corpus never reaches', () => {
		expect(() =>
			runCorpus([agreeing('a')], {
				b: { behaviour: 'never reached', old: 'old', next: 'new' },
			})
		).to.throw(/every annotated divergence must be reached/);
	});

	it('rejects a repeated case key', () => {
		expect(() => runCorpus([agreeing('a'), agreeing('a')], {})).to.throw(
			/duplicate corpus case key: a/
		);
	});
});

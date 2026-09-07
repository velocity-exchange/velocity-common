import { expect } from 'chai';

/**
 * A characterization corpus run against a legacy oracle. Every disagreement
 * must be listed in the divergence map with the behaviour it is there for, and
 * every listed divergence must be reached, so neither an unnoticed change nor a
 * stale annotation can survive.
 */
export interface CorpusCase {
	key: string;
	legacy: () => string;
	next: () => string;
}

export interface Divergence {
	behaviour: string;
	old: string;
	next: string;
}

export const attempt = (fn: () => string) => {
	try {
		return fn();
	} catch (e) {
		return `THROWS: ${(e as Error).message}`;
	}
};

export const runCorpus = (
	cases: CorpusCase[],
	divergences: Record<string, Divergence>
) => {
	const unusedKeys = new Set(Object.keys(divergences));
	const seenKeys = new Set<string>();
	for (const testCase of cases) {
		// A repeated key silently drops a case from the annotation check, so the
		// corpus builder has to keep them distinct.
		if (seenKeys.has(testCase.key)) {
			throw new Error(`duplicate corpus case key: ${testCase.key}`);
		}
		seenKeys.add(testCase.key);
		const legacy = attempt(testCase.legacy);
		const next = attempt(testCase.next);
		const divergence = divergences[testCase.key];
		if (divergence) {
			unusedKeys.delete(testCase.key);
			expect(legacy, `${testCase.key} old (${divergence.behaviour})`).to.equal(
				divergence.old
			);
			expect(next, `${testCase.key} new (${divergence.behaviour})`).to.equal(
				divergence.next
			);
		} else {
			expect(next, `${testCase.key} must be unchanged`).to.equal(legacy);
		}
	}
	expect(
		[...unusedKeys],
		'every annotated divergence must be reached'
	).to.deep.equal([]);
};

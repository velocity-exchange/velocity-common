import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Mocha loads this file as an ES module, so there is no __dirname to resolve
// from. It runs from common-ts in both `bun run test` and CI.
const CANDIDATES = [
	join(process.cwd(), 'src'),
	join(process.cwd(), 'common-ts', 'src'),
];
const SRC = CANDIDATES.find((path) => existsSync(join(path, 'format', 'core')));

/**
 * Every NumLib display member renders through the format layer, which is en-US
 * only, so `NumLib.setLocale` keeps its signature and does nothing at all. A
 * call reads as a separator change that never happens, so src may not make one.
 */
const FORBIDDEN = new RegExp(
	[
		String.raw`\bNumLib\s*(?:\?\.|\.)\s*setLocale\s*(?:\(|=(?!=))`,
		String.raw`\bNumLib\s*(?:\?\.)?\s*\[\s*(['"])setLocale\1\s*\]`,
	].join('|')
);

const hasForbiddenCall = (source: string) => FORBIDDEN.test(source);

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
	});

describe('NumLib.setLocale ratchet', () => {
	it('has no NumLib.setLocale call in common-ts src', () => {
		expect(SRC, `could not find common-ts/src from ${process.cwd()}`).to.be.a(
			'string'
		);

		const root = SRC as string;
		const offenders = sourceFiles(root).flatMap((path) =>
			hasForbiddenCall(readFileSync(path, 'utf8')) ? [relative(root, path)] : []
		);

		expect(
			offenders,
			'the format layer renders en-US only, so setting a locale changes nothing'
		).to.deep.equal([]);
	});

	it('catches every shape the call can take', () => {
		const caught = [
			"NumLib.setLocale('de-DE');",
			'NumLib?.setLocale("de-DE");',
			"NumLib['setLocale']('de-DE');",
			'NumLib.setLocale = () => {};',
			'NumLib\n\t.setLocale(\n\t\t"de-DE"\n\t);',
		];
		for (const source of caught) {
			expect(hasForbiddenCall(source), `missed: ${source}`).to.equal(true);
		}

		const allowed = [
			'// never call NumLib.setLocale',
			'const locale = NumLib.locale;',
			'myNumLib.setLocale("de-DE");',
		];
		for (const source of allowed) {
			expect(hasForbiddenCall(source), `false positive: ${source}`).to.equal(
				false
			);
		}
	});
});

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

// The react package reads the same BigNum module global, so it is scanned too.
const REACT_SRC = SRC ? join(SRC, '..', '..', 'react', 'src') : undefined;

// tests/ is deliberately out of scope: the characterization suite sets
// BigNum.delim on purpose, to prove the delegates no longer read it.

/**
 * `BigNum.setLocale` mutates the module-global `BigNum.delim`, which `print`,
 * `toFixed`, `toPrecision`, `printShort`, `fromPrint` and `toNum` all read. One
 * call anywhere in the process therefore corrupts value paths, not just display
 * output. Assigning `delim` or `spacer` directly does the same thing, so both
 * are forbidden as well. The format layer renders en-US only; there is no
 * supported way to change the separator.
 */
// A call or a reassignment, not a prose mention of the name. The whole file is
// matched at once so a member chain broken across lines is still caught.
const FORBIDDEN = new RegExp(
	[
		String.raw`\bBigNum\s*(?:\?\.|\.)\s*setLocale\s*(?:\(|=(?!=))`,
		String.raw`\bBigNum\s*(?:\?\.|\.)\s*(?:delim|spacer)\s*=(?!=)`,
		String.raw`\bBigNum\s*(?:\?\.)?\s*\[\s*(['"])setLocale\1\s*\]`,
		String.raw`\bBigNum\s*(?:\?\.)?\s*\[\s*(['"])(?:delim|spacer)\2\s*\]\s*=(?!=)`,
	].join('|')
);

const hasForbiddenWrite = (source: string) => FORBIDDEN.test(source);

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
	});

const offendersIn = (root: string, label: string): string[] =>
	sourceFiles(root).flatMap((path) =>
		hasForbiddenWrite(readFileSync(path, 'utf8'))
			? [`${label}/${relative(root, path)}`]
			: []
	);

describe('BigNum.setLocale ratchet', () => {
	it('has no BigNum.setLocale, delim or spacer writes in common-ts or react src', () => {
		expect(SRC, `could not find common-ts/src from ${process.cwd()}`).to.be.a(
			'string'
		);
		expect(
			REACT_SRC && existsSync(REACT_SRC),
			`could not find react/src from ${process.cwd()}`
		).to.equal(true);

		const roots: Array<[string, string]> = [
			[SRC as string, 'common-ts/src'],
			[REACT_SRC as string, 'react/src'],
		];

		const offenders = roots.flatMap(([root, label]) =>
			offendersIn(root, label)
		);

		expect(
			offenders,
			'BigNum.setLocale mutates a module global that value paths read; the format layer renders en-US only'
		).to.deep.equal([]);
	});

	it('catches every shape the write can take', () => {
		const caught = [
			"BigNum.setLocale('de-DE');",
			'BigNum?.setLocale("de-DE");',
			"BigNum['setLocale']('de-DE');",
			'BigNum["setLocale"]("de-DE");',
			'BigNum.setLocale = () => {};',
			"BigNum.delim = ',';",
			"BigNum.spacer = ' ';",
			"BigNum['delim'] = ',';",
			'BigNum\n\t.setLocale(\n\t\t"de-DE"\n\t);',
			'BigNum\n\t.delim = ",";',
		];
		for (const source of caught) {
			expect(hasForbiddenWrite(source), `missed: ${source}`).to.equal(true);
		}

		const allowed = [
			'// never call BigNum.setLocale',
			'const delim = BigNum.delim;',
			'expect(BigNum.delim).to.equal(",");',
			'myBigNum.setLocale("de-DE");',
			'NotBigNum.delim = ",";',
		];
		for (const source of allowed) {
			expect(hasForbiddenWrite(source), `false positive: ${source}`).to.equal(
				false
			);
		}
	});
});

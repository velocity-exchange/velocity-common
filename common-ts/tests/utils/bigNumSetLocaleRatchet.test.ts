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

// The react package reads the same BigNum module global, so it is scanned too
// when it is checked out beside common-ts.
const REACT_SRC = SRC ? join(SRC, '..', '..', 'react', 'src') : undefined;

/**
 * `BigNum.setLocale` mutates the module-global `BigNum.delim`, which `print`,
 * `toFixed`, `toPrecision`, `printShort`, `fromPrint` and `toNum` all read. One
 * call anywhere in the process therefore corrupts value paths, not just display
 * output. Assigning `delim` or `spacer` directly does the same thing, so both
 * are forbidden as well. The format layer's own `setDefaultLocale` is read only
 * by the format layer and is the supported way to move the separator.
 */
// A call or a reassignment, not a prose mention of the name.
const FORBIDDEN = /\bBigNum\s*\.\s*(setLocale\s*[(=]|delim\s*=|spacer\s*=)/;

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
	});

const offendersIn = (root: string, label: string): string[] =>
	sourceFiles(root).flatMap((path) =>
		readFileSync(path, 'utf8')
			.split('\n')
			.flatMap((line, index) =>
				FORBIDDEN.test(line)
					? [`${label}/${relative(root, path)}:${index + 1}`]
					: []
			)
	);

describe('BigNum.setLocale ratchet', () => {
	it('has no BigNum.setLocale, delim or spacer writes in common-ts or react src', () => {
		expect(SRC, `could not find common-ts/src from ${process.cwd()}`).to.be.a(
			'string'
		);

		const roots: Array<[string, string]> = [[SRC as string, 'common-ts/src']];
		if (REACT_SRC && existsSync(REACT_SRC)) {
			roots.push([REACT_SRC, 'react/src']);
		}

		const offenders = roots.flatMap(([root, label]) =>
			offendersIn(root, label)
		);

		expect(
			offenders,
			'BigNum.setLocale mutates a module global that value paths read; use setDefaultLocale from ./format instead'
		).to.deep.equal([]);
	});
});

import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { toBigNum } from '../../src/index';

/**
 * The ./format subpath must stay importable without dragging the SDK's runtime
 * barrel in behind it, which is why the one SDK-loading adapter is published
 * from the package root instead. A require cache only ever holds one graph, so
 * the check runs in a child process rather than inside this suite.
 */

// mocha runs from the package directory, and a wrong root fails the require
// rather than passing the assertion.
const PACKAGE_ROOT = process.cwd();

function loadsSdk(entry: string, register: string[]): boolean {
	const script = `
		require(${JSON.stringify(entry)});
		const loaded = Object.keys(require.cache).some((key) =>
			key.includes('@velocity-exchange/sdk')
		);
		process.stdout.write(String(loaded));
	`;
	const output = execFileSync(process.execPath, [...register, '-e', script], {
		cwd: PACKAGE_ROOT,
		encoding: 'utf8',
		env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
	});
	return output.trim() === 'true';
}

/** null lets a local run skip. CI builds first, so there it is a failure. */
function builtPath(relative: string): string | null {
	const full = path.join(PACKAGE_ROOT, relative);
	if (existsSync(full)) return full;
	if (process.env.CI) {
		throw new Error(`${relative} is missing: build before running the suite`);
	}
	return null;
}

describe('format/SDK boundary', () => {
	it('does not load the SDK when the format source is imported', () => {
		expect(
			loadsSdk(path.join(PACKAGE_ROOT, 'src/format/index.ts'), [
				'-r',
				'ts-node/register',
			])
		).to.equal(false);
	});

	it('does not load the SDK when the built format subpath is imported', function () {
		const built = builtPath('lib/format/index.js');
		if (!built) return this.skip();
		expect(
			loadsSdk(built, []),
			'the built subpath loads the SDK, or lib/ is stale'
		).to.equal(false);
	});

	it('publishes the SDK-backed adapter from the package root', () => {
		expect(typeof toBigNum).to.equal('function');
	});

	it('names the adapter parameter type from the package root', function () {
		const types = builtPath('lib/index.d.ts');
		if (!types) return this.skip();
		expect(readFileSync(types, 'utf8')).to.match(
			/export type \{ Decimal \}/,
			'a root consumer cannot annotate a toBigNum argument'
		);
	});
});

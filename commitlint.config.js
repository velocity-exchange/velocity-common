/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'scope-enum': [
			2,
			'always',
			['common-ts', 'posthog-types', 'react', 'icons', 'deps', 'deps-dev', 'repo'],
		],
		'subject-case': [0],
	},
	ignores: [
		(message) => message.startsWith('chore: release '),
		(message) => /\[skip ci\]/.test(message),
		(message) => message.startsWith('Merge '),
	],
};

# velocity-common

Shared TypeScript code used across Drift/Velocity Exchange frontends, bots, and services. The repo is a multi-package workspace; each top-level directory is an independently published (or consumed-by-path) package.

## Packages

| Path | Package | Purpose |
| --- | --- | --- |
| [`common-ts/`](./common-ts) | `@velocity-exchange/common` | Core, framework-agnostic library: market/account/order/position math, trading + validation utils, serializable types, clients, and constants. Built on top of the Drift / Velocity SDK and `@solana/web3.js`. |
| [`react/`](./react) | `@velocity-exchange/react` | React 19 building blocks for connecting UIs to the Drift program — providers, hooks, zustand stores, wallet-adapter glue. Depends on `common-ts` and `icons` via file paths. |
| [`icons/`](./icons) | `@velocity-exchange/icons` (private) | Figma → React icon pipeline. SVGs are pulled from Figma and converted to typed React components via `@svgr/core`; output is bundled with `rollup` / `tsc`. |
| [`posthog-types/`](./posthog-types) | `@velocity-exchange/posthog-types` | Shared PostHog event type definitions so producers (apps) and consumers (analytics) stay in sync. |

`common-ts` and `posthog-types` are released to npm via [release-please](https://github.com/googleapis/release-please) (see [`release-please-config.json`](./release-please-config.json)). `react` and `icons` are consumed locally by sibling apps via `file:` references.

## Repo layout

```
velocity-common/
├── common-ts/          # @velocity-exchange/common — core TS library
├── react/              # @velocity-exchange/react — React hooks/providers/stores
├── icons/              # @velocity-exchange/icons — Figma-generated React icons
├── posthog-types/      # @velocity-exchange/posthog-types — shared analytics types
├── .github/            # CI workflows, release-please config
├── .husky/             # git hooks (commitlint, prettier, lint)
├── release-please-config.json
├── commitlint.config.js
└── package.json        # root: shared tooling (eslint, prettier, husky, tsc)
```

The root `package.json` only holds shared tooling. There is no Yarn/Bun workspaces wiring — each package manages its own `bun.lock` and is installed independently.

## Prerequisites

- Node **24.x** (see [`.nvmrc`](./.nvmrc))
- [Bun](https://bun.sh) for installs and scripts (each package ships a `bun.lock`)

## Quick start

```bash
# from repo root
nvm use            # picks up Node 24 from .nvmrc

# install + build common-ts first — react depends on it via file:../common-ts
cd common-ts && bun install && bun run build && cd ..

# icons next — react depends on it via file:../icons
cd icons && bun install && bun run build && cd ..

# then react
cd react && bun install && bun run build && cd ..

# posthog-types is standalone
cd posthog-types && bun install && bun run build && cd ..
```

If you're only working in one package, you can usually just `cd` into it and `bun install` — the file-path dependencies pick up whatever is currently built in the sibling directories.

## Common scripts (root)

| Script | What it does |
| --- | --- |
| `bun run lint` / `lint:fix` | ESLint over all `.ts`/`.tsx` |
| `bun run prettify` / `prettify:write` | Prettier check / write |
| `bun run typecheck` | `tsc --noEmit` for the `common-ts` project |

Per-package scripts (`build`, `test`, `watch`, etc.) live in each subpackage's `package.json`.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint via Husky. Use `feat:`, `fix:`, `refactor:`, `chore:`, etc. Release-please derives versions and changelogs from these prefixes.
- **Releases** are automated: merging conventional commits to `master` opens / updates a release-please PR per package; merging that PR tags and publishes.
- **Formatting** is Prettier-enforced; lint runs on push via Husky.

## Notes

- The package previously published as `@drift-labs/common` is now `@velocity-exchange/common` (see `common-ts/package.json`). Older docs or examples referencing `@drift-labs/common` should be read as the same package.
- `icons` is marked `private` and is not published — it is consumed locally by `react` and downstream apps via a file-path dependency.

# common-ts

Shared TypeScript library (`@velocity-exchange/common`) of utilities, clients, and
drift/Velocity domain logic. Published to npm and consumed by other apps, so the
public API surface is a contract.

## Build & verify

```bash
bun run build          # tsc -> lib/, must stay clean
bun run test           # mocha, non-drift suites
bun run test:drift     # mocha, drift/Velocity suites
bun run circular-deps  # madge, must report no cycles
```

Run build + the relevant test suite + circular-deps before considering any change done.

Baseline (master, as of 2026-06-18): build clean, non-drift tests 106 passing,
circular-deps clean. `test:drift` is **already failing** on master from a pre-existing
type error in `tests/drift/.../accountManagement.test.ts` (a `PublicKey` passed where a
`User` is expected) — not caused by simplification work; don't attribute it to a change.

## Public API is a contract

Every subpath in `package.json` `exports` (`.`, `./clients`, `./utils/math`,
`./utils/strings`, `./utils/enum`, `./utils/validation`, `./utils/token`,
`./utils/trading`, `./utils/markets`, `./utils/orders`, `./utils/positions`,
`./utils/accounts`, `./utils/core`) is imported by downstream apps. Do not rename or
remove exported symbols reachable from these without an explicit migration. Symbols that
are internal-only (verify with `rg` across `src`) are free to refactor or delete.

## What "simple" means here

- **Comments:** default to none. Keep only comments that explain a non-obvious *why* —
  a hidden constraint, a workaround for a known bug, surprising behavior. Delete comments
  that restate the code, reference a past task/PR/ticket, or mark `// removed` / `// deprecated`.
- **No compat cruft:** no backwards-compat shims, no `_unused`-renamed vars kept "for compat",
  no re-exports with no consumer, no dead feature-flag branches.
- **No defensive code at internal boundaries:** validate at true system boundaries only
  (network responses, user input, external SDK contracts that throw). Don't add null checks
  or try/catch around trusted internal calls the types already guarantee.
- **Prefer inline over premature abstraction:** three similar inline lines beat a
  single-call-site helper. Don't add generic params or wrappers for a hypothetical second caller.
- Real deduplication of large near-identical blocks is welcome; collapsing three short
  similar lines into a clever abstraction is not.

## Slots and wall-clock time

Solana's slot time is dropping from 400ms to 200ms through feature gates, so slots
are integers compared against the live slot; wall-clock is ms converted at the read
site; never write a slot length. This package does not resolve the live duration
itself: every function whose behavior depends on slot length takes a `SlotDurationMs`
parameter, and the outermost caller resolves it from `State` via the SDK's
`activeSlotDurationFromState`. Convert with the SDK's `math/time` helpers
(`millisFromSlots`, `msToSlotsCeilNum`, `slotsToMsNum`), ceiling user-protection
budgets and flooring risk ceilings. `SLOT_TIME_ESTIMATE_MS` is deprecated and CI
fails if it reappears.

## Type safety

`strictNullChecks` is currently **off** in `tsconfig.json` (there's a standing TODO to
enable it). Flag null-safety bugs you find, but enabling the flag is a separate, larger
project — don't turn it on as part of a simplification pass.

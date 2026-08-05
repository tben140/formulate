# ADR 0002 — TypeScript `~6.0.3`, not 7

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

TypeScript 7 — the native port — was available at scaffolding time and is
dramatically faster. Reaching for the newest version is the obvious move on a
greenfield project.

It does not work here, for a reason that has nothing to do with TypeScript
itself. **`typescript-eslint` caps its `typescript` peer range at `<6.1.0`.** Its
parser is what allows ESLint to read TypeScript at all, so without a compatible
version there is no TypeScript linting in the workspace.

The initial attempt pinned TypeScript 5.9 to stay inside that range. That worked,
but gave up more than necessary.

## Decision

TypeScript `~6.0.3` across every package.

6.0.3 is the highest version that satisfies `typescript-eslint`'s `<6.1.0` cap,
and it is also exactly what Expo SDK 57 expects — so one version serves both
constraints with nothing left over.

## Alternatives considered

**TypeScript 7 without typescript-eslint.** Lint with ESLint's JavaScript rules
only, and rely on `tsc` for type errors. Rejected: it discards every
type-aware rule, and type-aware linting is a large part of why ESLint is
configured at all.

**TypeScript 5.9.** The first attempt, and safe. Rejected once 6.0.3 was found to
satisfy both constraints — 5.9 gave up TypeScript 6 features for no additional
compatibility.

**Two TypeScript versions, one per app.** Rejected on sight. Divergent compiler
versions in a monorepo produce type errors that appear in one package and not
another, which is among the most confusing failure modes available.

## Consequences

**`baseUrl` is deprecated in TypeScript 6.** The app tsconfigs use `paths` alone.
Anyone copying a tsconfig from an older project will reintroduce `baseUrl` and
get a deprecation warning.

**The workspace is pinned behind the fastest available compiler**, and will stay
there until `typescript-eslint` widens its range. On a codebase this size the
speed difference is not felt.

**The pin is `~6.0.3`** — patch updates allowed, minor updates not. `6.1.0` would
break the peer range.

## Revisit when

`typescript-eslint` publishes a release supporting TypeScript 7. That is the
single condition; nothing else about this decision is load-bearing.

## Related

- [Architecture](../architecture.md)

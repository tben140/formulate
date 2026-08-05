# ADR 0004 — Pin `lightningcss` to 1.30.1 workspace-wide

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

NativeWind v5 ([ADR 0003](0003-nativewind-v5-and-tailwind-v4.md)) compiles CSS
with `lightningcss`, then **deserialises that compiled output inside
`react-native-css`**. Both halves must agree on the serialisation format.

Three packages in the tree want a say in which version is installed:

| Wants it                      | Version      |
| ----------------------------- | ------------ |
| `@tailwindcss/node`           | 1.32.0       |
| `react-native-css` peer range | up to 1.33.0 |
| NativeWind v5 documentation   | **1.30.1**   |

Only 1.30.1 produces a payload `react-native-css@3.0.7` can read. Anything newer
fails with:

```
SyntaxError: global.css: failed to deserialize;
expected an object-like struct named Specifier, found ()
```

The dangerous part: **the failure surfaces only at Metro bundle time, never at
install time.** `pnpm install` succeeds, `pnpm typecheck` passes, CI is green, and
the app fails to bundle when someone runs `expo start`. Nothing in the dependency
graph flags it, because every stated peer range is satisfied.

## Decision

A workspace-wide pnpm override:

```yaml
overrides:
  lightningcss: 1.30.1
```

## Alternatives considered

**Match Tailwind's pin (1.32.0).** This was tried first, on the reasoning that
the compiler and the CSS toolchain should agree. **It was wrong** — the version
that matters is the one `react-native-css` can deserialise, not the one Tailwind
compiles with. NativeWind's documented 1.30.1 was correct, and reasoning from
first principles beat reading the documentation only because the documentation
turned out to be right.

**Scope the override to `apps/mobile`.** Rejected: under `node-linker=hoisted`
there is effectively one flat `node_modules`, so a scoped override cannot
reliably keep a second copy out of Metro's resolution path.

**Wait for NativeWind v5 stable.** Rejected — that is the same decision as
abandoning [ADR 0003](0003-nativewind-v5-and-tailwind-v4.md), which was taken on
its own merits.

## Consequences

**A transitive dependency is pinned below what two direct dependencies request.**
This looks like neglect, which is exactly why it needs a record. It is also
commented in `pnpm-workspace.yaml`, including the error text, so it is
discoverable from the file itself.

**Dependabot and similar tools will propose bumping it.** Those pull requests
must be rejected until NativeWind v5 states a newer supported version.

**CI cannot catch a regression here.** CI runs lint, typecheck and build; the
Expo `build` script is `expo export`, which does bundle — so in practice a bad
version would surface there. But nothing tests it _as_ a version constraint, and
the failure message names deserialisation rather than versions, so the connection
is not obvious from the error alone.

## Revisit when

NativeWind v5 leaves preview and states a supported `lightningcss` version. Move
to whatever it names — do not simply take the newest.

## Related

- [ADR 0003](0003-nativewind-v5-and-tailwind-v4.md) · [Mobile app](../surface-mobile.md)

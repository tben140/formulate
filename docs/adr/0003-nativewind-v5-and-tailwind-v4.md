# ADR 0003 — NativeWind v5 preview with Tailwind v4

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

Both React surfaces should style from the same design tokens. `packages/tokens`
generates a Tailwind v4 `@theme { … }` block from a single TypeScript source, and
the web app consumes it directly.

The Expo app can only consume that file if its Tailwind version matches.
Tailwind v4 moved theme configuration into CSS — the `@theme` block — and dropped
the JavaScript `tailwind.config.js` model that v3 used. The two are not
interchangeable.

At the time of writing:

- **NativeWind v4** is stable, and supports **Tailwind v3 only**.
- **NativeWind v5** supports Tailwind v4, and is in **preview**
  (`5.0.0-preview.4`).

So there is no version pair that is both stable and shared.

## Decision

NativeWind `5.0.0-preview.4` with Tailwind v4, so both React surfaces consume the
same generated `theme.css`.

## Alternatives considered

**NativeWind v4 + Tailwind v3 in `apps/mobile` only**, with the web app on
Tailwind v4. Rejected because it means generating tokens twice, in two
incompatible formats, from the same source — and the second generator would have
to be maintained by hand against a version that is already superseded. This
remains the fallback if v5 proves unworkable.

**Tailwind v3 everywhere.** Consistent, and stable on both surfaces. Rejected:
it means starting a new project on the superseded major, and losing the
CSS-first `@theme` model that makes the generated-token approach clean in the
first place.

**No Tailwind in the mobile app** — StyleSheet objects consuming the TypeScript
tokens directly. Genuinely viable, and the tokens are exported as TypeScript
precisely so this escape hatch exists. Rejected as the default because it makes
the two surfaces read very differently for no gain, and reviewing "do these
match?" gets much harder.

## Consequences

**A pre-release dependency in the build.** Preview versions can break between
releases. The pin is exact (`5.0.0-preview.4` at first, `5.0.0-rc.0` since
October 2026; no range) so an install cannot silently move.

**This decision forces [ADR 0004](0004-pin-lightningcss-to-1-30-1.md).**
NativeWind v5 compiles CSS with `lightningcss` and deserialises the result inside
`react-native-css`, which is why `lightningcss` is pinned workspace-wide. That
pin is a direct consequence of this choice and cannot be evaluated separately.

**Metro configuration stays minimal.** `metro.config.js` wraps the Expo default
with `withNativewind` and one resolver rule (see the update below), nothing
else — notably no `watchFolders` or
`resolver.nodeModulesPaths`, which Expo SDK 52+ configures itself and which now
cause resolution bugs when set manually.

**The single reason this is worth the risk:** one file
(`packages/tokens/src/tokens.ts`) drives web, native and — via a second generated
output — Liquid. A colour changed once moves three storefronts. Splitting the
Tailwind versions would make that claim untrue in the first place.

## Revisit when

NativeWind v5 leaves preview. At that point the pin should move to a stable
range, and the `lightningcss` override should be re-evaluated against whatever
version the stable release states.

## Related

- [ADR 0004](0004-pin-lightningcss-to-1-30-1.md) · [Mobile app](../surface-mobile.md)

## Update, October 2026: Expo SDK 58 and `5.0.0-rc.0`

The decision stands; the versions moved. Expo Go only runs the newest SDK, so
the app moved to Expo SDK 58 (React Native 0.88), and `5.0.0-preview.4` could
not come with it:

- **`react-native-css` 3.0.7 crashes SDK 58 at startup.** NativeWind's runtime
  resolves every `react-native` import, `node_modules` included, to its own
  stand-in so `className` works on core components. The 3.0.7 stand-in lists
  React Native's exports by hand and has no `NativeComponentRegistry`, which
  `expo-modules-core` 58 calls before the first screen ("Cannot read property
  'get' of undefined" in `requireNativeComponent`). `3.1.0-rc.0` adds it, and
  NativeWind `5.0.0-rc.0` requires exactly that version.
- **The rc stand-in still has no `AssetRegistry`,** which `expo-asset` reads to
  load fonts. `metro.config.js` therefore gives `expo-asset` the real
  `react-native`. It renders nothing styled, so nothing is lost; remove the rule
  once `react-native-css` passes `AssetRegistry` through.
- **ADR 0004's `lightningcss` 1.30.1 pin still holds:** the app bundles with it
  under `3.1.0-rc.0`. Newer `lightningcss` versions were not re-tested.

Both failures surfaced only at runtime in Expo Go, never at install, typecheck
or bundle time. ADR 0004's failure is one stage earlier, at Metro bundle time,
but the cause is the same: `react-native-css` sits between the app and React
Native, and nothing before it runs catches a mismatch. After a NativeWind or
`react-native-css` change, open the app, not just the bundle.

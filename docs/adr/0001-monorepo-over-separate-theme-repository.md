# ADR 0001 — Monorepo, including the Liquid theme

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

The Next.js app and the Expo app were always going to share a repository: they
share a Storefront client, query documents, generated types and design tokens.
That part was never in question.

Adding a Liquid theme as a third surface was. Shopify's own tooling assumes a
theme lives at the **root of its own repository** — the GitHub theme integration,
which syncs a branch to a live theme and gives merchants a Git-backed editing
workflow, requires it. Putting the theme at `apps/theme` gives that up.

The theme also has no build step and no `package.json` in Shopify's own examples;
Horizon ships 81 JavaScript files with no manifest and no `tsconfig`. It is not
obviously a workspace package at all.

## Decision

One repository. The theme lives at `apps/theme` as a pnpm workspace package, and
the GitHub theme integration is not used.

## Alternatives considered

**A separate theme repository, using the GitHub integration.** Would preserve
merchant-facing Git sync. Rejected because the design tokens would have to cross
a repository boundary — published as a package, or copy-pasted. Publishing a
package for a demonstration store is disproportionate; copy-pasting means the
token pipeline is a claim rather than a fact, and the whole reason the theme
exists is to prove that pipeline is real.

**A git submodule.** Keeps one clone while preserving a root-level theme
repository. Rejected: submodules make the token dependency directional and
fiddly, and add a class of "forgot to update the pointer" failure for no benefit
that matters here.

**Theme at the repository root, apps beneath it.** Satisfies Shopify's tooling
exactly. Rejected because it inverts the structure to serve the smallest of the
three surfaces, and would put a `sections/` directory next to `apps/`.

## Consequences

**Every Shopify CLI invocation needs `--path .`.** Without it the CLI walks up to
the monorepo root looking for a theme. Theme check then inspects 183 files and
reports existing assets as missing. Every script in `apps/theme/package.json`
carries the flag.

**The theme is deployed by `shopify theme push`, not by a Git push.** That is
manual, and it is the real cost. Acceptable here because there is no merchant
editing this theme through the admin.

**`@shopify/cli` must be a devDependency.** CI runs `turbo lint` across every
package, and `@formulate/theme:lint` invokes `shopify theme check`. The CLI
initially existed only as a global Homebrew install on one machine, so a clean
runner had no binary — the branch would have turned CI red on merge. Pinned to
4.6.0, the version the theme was authored against.

**The theme still works standalone.** `assets/tokens.css` is committed rather
than generated at deploy time, so `shopify theme dev` works for anyone who never
runs this repository's tooling. This was a design requirement, not an accident —
it is what keeps the monorepo from making the theme worse.

## Revisit when

A merchant needs to edit this theme through the Shopify admin with changes
flowing back to Git. At that point the GitHub integration stops being a
convenience and becomes a requirement, and the token pipeline would need
rethinking around a published package.

## Related

- [ADR 0005](0005-parity-means-design-not-data.md) · [Liquid theme](../surface-theme.md)

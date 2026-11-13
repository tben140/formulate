# ADR 0005 — Parity means design, not data

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

Three surfaces render the same store. "Parity" is an easy word to use and a hard
one to mean, and getting it wrong in either direction is costly:

- Too weak, and the three surfaces are just three unrelated projects sharing a
  repository.
- Too strong, and the Liquid theme is forced to fetch over the Storefront API
  from the browser so that it goes through the same code path as the React apps —
  which is slower, worse for SEO, and simply not how a theme works.

The question came to a head when the theme was built. `apps/web` and
`apps/mobile` both consume `packages/shopify`. Should `apps/theme`?

## Decision

**Parity is the design system. It is not the data layer, and it is not the
catalogue.**

Concretely:

- All three surfaces resolve every colour, space, radius and font size to a token
  generated from `packages/tokens/src/tokens.ts`.
- The theme reads data through **Liquid**, server-side, and does not use
  `packages/shopify` at all.
- The three surfaces do not share UI components.
- The three surfaces are **not** expected to display the same products.

## Alternatives considered

**The theme fetches through `packages/shopify` client-side.** Would make the data
layer genuinely shared. Rejected: it means shipping a Storefront token to the
browser to re-fetch data Liquid already has server-side, delaying first paint,
and rendering the product grid after JavaScript loads — on the one surface where
SEO actually matters.

**Share UI components across all three.** Rejected. A React Native `<View>`, a
React DOM `<div>` and a Liquid `{% render %}` are not the same thing. An
abstraction spanning all three would fit none of them, and would be the first
thing to break when any surface needed something specific.

**Force catalogue parity by republishing products.** Rejected — see below.

## Consequences

**The three surfaces show different numbers of products, and that is correct.**

The storefront opens on `automated-collection`, a smart collection with the rule
`variant price > 200 AND < 800`. Shopify's admin counts 8 products in it:

- 6 are published to both **Online Store** and **Headless**.
- **The Hidden Snowboard** is published to Headless but _not_ Online Store.
- **The Archived Snowboard** is archived and published nowhere.

So the theme renders **6** and the headless surfaces render **7**. Anyone
comparing the surfaces side by side notices within seconds, so it is stated in
the [domain model](../domain-model.md#publication-is-part-of-the-model) rather
than explained afterwards.

This could be "fixed" by publishing everything everywhere. It is deliberately
not, because sales-channel publication is a real Shopify concept that real
merchants use, and a demonstration that hides it is less honest than one that
explains it.

**Parity has to be verified by measurement, not by shared code.** Since nothing
enforces it structurally, the theme's layout was checked against `apps/web`'s
computed values — container 1024px, padding-inline 16px, padding-block 32px, nav
16px, wordmark 18px/600, border 1px `#e2e8f0` — rather than eyeballed.

**One generator, two outputs.** `packages/tokens/scripts/build-css.ts` builds the
declaration list once and hands it to both writers: a Tailwind `@theme` block and
a plain `:root` block. Sharing the declarations rather than the file is the whole
mechanism; two independent generators would drift.

**Structure may differ where the platform differs.** `apps/web` redirects `/` to
the default collection. The theme renders that collection through a
`featured-collection` section instead, because a theme's homepage is a real,
merchant-editable page and a redirect would be wrong. Same destination,
different mechanism — and that is within parity as defined here.

## Revisit when

A fourth surface appears that _does_ need client-side Storefront access, or the
theme grows a feature Liquid cannot serve server-side — a live cart drawer is the
obvious candidate, and it will use the AJAX Cart API rather than
`packages/shopify`.

## Related

- [ADR 0001](0001-monorepo-over-separate-theme-repository.md) · [Liquid theme](../surface-theme.md) · [Domain model](../domain-model.md)

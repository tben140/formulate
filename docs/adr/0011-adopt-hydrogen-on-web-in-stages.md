# ADR 0011 — Adopt framework-agnostic Hydrogen on web, in stages, behind a trial

- **Status:** Proposed. The trial (SHO-170) can't start before 23 October 2026.
- **Date:** 2026-10-16

## Context

`@shopify/hydrogen` 2026.10.0 (released 9 October 2026; 2026.10.1 on 13 October)
is no longer a React Router framework. It is a framework-agnostic library
with a Next.js App Router guide and these parts:

- a typed Storefront client (`gql.tada`);
- **request handlers** run from Next's `proxy.ts`
  (`handleShopifyRoutes`), giving a same-origin Storefront API proxy,
  `/checkout`, cart permalinks and Customer Account routes;
- `ShopifyScripts`, which loads Shopify's Customer Privacy API and analytics
  bus, with consent modes `no-banner`, `default-banner` and `custom-banner`;
- cart server handlers and a client cart store, with React bindings;
- Customer Account API sessions and handlers, predictive search, markets,
  Shop Pay, image URL sizing helpers;
- 20 agent skills, installed by `npx @shopify/hydrogen setup` into
  `.claude/skills` and `.agents/skills`.

This was read from the 2026.10.1 package source and its skills, not only the
announcement.

**What web has instead (after the October batch):**

| Area              | Ours today                                                                                           | Where                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Storefront client | Hand-written fetch client, shared with the app                                                       | `packages/shopify` (`client.ts`, `queries.ts`, codegen)              |
| Cart              | Server Actions, httpOnly cookie, `addLinesOrCreate` with dead-cart recovery (#23) and stock warnings | `apps/web/app/actions/cart.ts`, `packages/shopify/src/cart.ts`       |
| Customer accounts | Hand-written PKCE flow and session (#76)                                                             | `packages/shopify/src/customer-account.ts`, `apps/web/app/account/*` |
| Consent           | Our own banner and cookie (ADR 0008; ADR 0010 proposes two tiers)                                    | `apps/web/components/tracking-consent.tsx`                           |
| Analytics         | PostHog over `fetch`, Klaviyo onsite, ad tags; no Shopify analytics on web                           | `packages/analytics`, `apps/web/lib/*`                               |
| Images            | `Image` from the older `@shopify/hydrogen-react`; codegen scalars from it too                        | four components, `packages/shopify/codegen.ts`                       |
| Predictive search | Our own combobox (#87)                                                                               | `apps/web/components/predictive-search.tsx`                          |

So Hydrogen doesn't add a missing feature. It offers maintained versions of
things we built by hand, plus two things we couldn't do well ourselves:
**Shopify's own analytics for the headless channel**, and **consent shared
with Shopify's systems** without exposing the token or hijacking globals
(ADR 0008's blockers).

## Decision

**Adopt Hydrogen on web in stages, each one only if the trial shows it's
better than what we have. The app keeps `packages/shopify`.**

### Stage 0: the trial (SHO-170), from 23 October

On a branch, with no merge commitment:

1. Install `@shopify/hydrogen@2026.10.0` (14-day rule; 2026.10.1 from
   27 October). **Do not run `npx @shopify/hydrogen setup`** until Ben has
   read the skills it writes into `.claude/skills`. Install with pnpm instead.
2. `proxy.ts` with `handleShopifyRoutes` and a **public** Storefront client
   whose token is read on the server only. Keep the variable name without
   `NEXT_PUBLIC_`, as `apps/web/AGENTS.md` requires.
3. `ShopifyScripts` in **`custom-banner`** mode, fed by our existing banner,
   with the two tiers from ADR 0010 (if accepted) mapped to Shopify's
   `analytics` and `marketing` purposes.

### Tests the trial must pass

| #   | Test                                                                                | Why                                                                                                                 |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | **Stale cart cookie.** Add to cart with a cookie for a completed or expired cart    | Reading 2026.10.1's `executeAdd`, Hydrogen returns the error and doesn't recover or clear the cookie. #23 does both |
| 2   | **Consent reaches checkout** from a `*.vercel.app` preview, with no shared domain   | The main benefit of Shopify's consent; ADR 0008 assumed it needs a common parent domain                             |
| 3   | **Shopify analytics** events show in the admin's reports under the headless channel | The main thing we can't do ourselves                                                                                |
| 4   | **Lighthouse** before and after, on the home page and a product page                | `ShopifyScripts` and the proxy add work to every request and page                                                   |
| 5   | **Klaviyo stays gated** by our own check                                            | Hydrogen's consent gate only covers its own analytics destinations                                                  |
| 6   | **Existing e2e suite** passes unchanged                                             | No behaviour regressions                                                                                            |

### Later stages, each decided after the trial

1. **Consent and analytics** (stage 0 made permanent) if tests 2–5 pass.
2. **Images:** move from `@shopify/hydrogen-react`'s `Image` to Hydrogen's
   image URL helpers, or to our own `sizedImageUrl` (#63). Small, and removes
   the older package once codegen gets its scalars elsewhere.
3. **Cart:** only if Hydrogen's cart is at least as good as ours. It would
   need #23's dead-cart recovery wrapped around it (or upstreamed). The stock
   warnings (SHO-131) need checking against its `warnings` handling.
4. **Customer accounts:** replace our PKCE flow with Hydrogen's handlers
   only if it removes code without losing #76's behaviour (order history,
   the refresh flow, deletion through the Worker).
5. **Storefront client:** last, if at all (see Consequences).

## Alternatives considered

**Adopt everything at once.** Rejected. It would touch the cart, accounts,
consent and data fetching together, so a regression couldn't be traced, and
it would land on top of the October batch merge.

**Don't adopt.** Keeps everything working, but leaves ADR 0008's consent
limitation in place and web without Shopify's own analytics. A portfolio
built on Shopify in late 2026 that ignores Hydrogen's new direction would
also need explaining.

**Move the app to Hydrogen's client too.** Hydrogen's core is plain
`fetch`-based TypeScript and might run in React Native, but nothing in its
docs or skills mentions React Native or Expo, and its handlers assume a web
server. Not worth the risk to the app.

## Consequences

- **Web and the app may stop sharing one Storefront client** (stage 5). That
  weakens the "one shared client" story in `docs/architecture.md` and ADR
  0005's parity rule. Stages 1–4 don't require it: web can use Hydrogen's
  handlers while queries still come from `packages/shopify`.
- **A second consent integration.** Our banner stays the source of truth;
  `ShopifyScripts` is told the answer. Two places to keep in step.
- **Version churn.** A patch four days after release suggests a moving API.
  Pin exact versions and read the release notes before each bump.
- **Agent skills** in `.claude/skills` would steer future agent work towards
  Hydrogen's patterns. They need reading before they're installed, and
  `hydrogen skills check` in CI if they're kept.
- **Our own code still matters where Hydrogen is weaker:** dead-cart recovery
  (#23), the consent tiers (ADR 0010), Klaviyo gating, and the app.

## Relation to other work

- **Shopify Events caching (SHO-171):** independent of Hydrogen, but if
  stage 0 adopts `proxy.ts`, the Events route handler and `cacheTag` wiring
  should follow Hydrogen's Next.js guide (`"use cache"` and `cacheTag`) so
  the two don't fight.
- **ADR 0010:** its two consent tiers map onto Shopify's purposes in
  `custom-banner` mode. If ADR 0010 is rejected, map the single opt-in to all
  four purposes.

## Revisit when

- The trial's results are in (expected late October 2026).
- Hydrogen documents React Native support. Then stage 5 could cover the app
  too, and parity would be restored.

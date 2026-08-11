# AGENTS.md — apps/api

The Klaviyo consent proxy. A Cloudflare Worker. The root
[`AGENTS.md`](../../AGENTS.md) applies as well; this file records what is
different.

Background: [ADR 0007](../../docs/adr/0007-mobile-consent-goes-through-a-worker.md).

## Why this exists at all

The Expo app cannot record marketing consent. Klaviyo's React Native SDK has no
consent API, `/client/subscriptions/` is answered with a Cloudflare 403 from a
native client, and Klaviyo's in-app forms cannot collect consent yet. A server
call with a private key is the only route left, and it is the one Klaviyo's own
documentation prescribes.

**Web and theme do not use this.** They record consent directly from the client
with the public key, which is what those endpoints are for. Do not "unify" the
three surfaces onto this worker — each uses the strongest mechanism available to
it, and that difference is the interesting part.

## This is a public endpoint holding a credential

Everything here follows from that. The threat is not key theft; it is a confused
deputy — someone borrowing this worker's authority without ever needing the key.

### ⚠️ Never forward a caller-supplied object upstream

The request contract is `{ email }` and **nothing else**. The Klaviyo payload is
constructed here, and the list id comes from `vars`. Merging a client-supplied
object into it would let anyone choose the destination list, set arbitrary
profile properties, or forge `custom_source`. Validating such a body safely is
harder than never accepting one.

### ⚠️ Never return Klaviyo's error body

A wrong list id makes Klaviyo say `"List not found"` — true information about our
configuration, handed to whoever asked. Callers get one of a small set of generic
reasons; the detail is logged.

Note this is the **opposite** of what the client surfaces do, where surfacing
Klaviyo's error body was correct and saved hours. Same code, different recipient.
Error verbosity scales with the trust of who receives it.

### ⚠️ `vars` is not for secrets

Values in `wrangler.jsonc` under `vars` are plaintext — committed, and visible in
the dashboard. `KLAVIYO_PRIVATE_KEY` is set with `wrangler secret put` and must
never appear there. This is the most common way to leak a key on this platform,
and it looks identical in code.

### Other invariants

- **No CORS headers.** A native caller needs none, and their absence prevents
  cross-origin browser use. Do not add them to "fix" anything.
- **No dependencies.** The runtime provides `fetch`, `Request`, `Response`. Keep
  it that way; it is the strongest supply-chain control available.
- **No email addresses in logs.** Personal data. Status codes and Klaviyo's own
  message are enough to diagnose with.
- Rate limiting keys on `CF-Connecting-IP`, which the edge sets. Never
  `X-Forwarded-For`, which the caller controls.

## The runtime is not Node

No `fs`, no `Buffer`, no Node `crypto`, no `process.env` — environment arrives as
the `env` argument to `fetch`. Most of npm does not work here. `tsconfig.json`
types this with `@cloudflare/workers-types` rather than Node's, so code that
cannot run also cannot compile.

This is the same runtime (`workerd`) that Shopify's Oxygen is built on.

## Commands

```bash
pnpm --filter @formulate/api dev      # local, on workerd
pnpm --filter @formulate/api deploy   # publish
```

Secrets are per-environment and set from the CLI:

```bash
pnpm --filter @formulate/api exec wrangler secret put KLAVIYO_PRIVATE_KEY
```

## The rate limiter is a Durable Object, not the binding

⚠️ Cloudflare's `ratelimits` binding was tried and **enforced nothing** —
`{"success":true}` on every call, across 30+ requests against a limit of 5/60s.
It is documented as "permissive, eventually consistent, and intentionally
designed to not be used as an accurate accounting system". Do not reinstate it.

A Durable Object replaces it: single-threaded and serialised, so the
read-modify-write cannot interleave. The *rule* lives in
`src/rate-limit-policy.ts` as a pure function so it can be tested without a
runtime; the DO is a storage shell.

## Verification

`202` from Klaviyo means queued, never recorded — and with a double opt-in list
nobody joins until they click a confirmation link. So a green response here is
not proof of anything downstream. Check Klaviyo's dashboard.

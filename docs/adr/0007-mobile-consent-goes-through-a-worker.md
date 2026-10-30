# 7. Mobile marketing consent goes through a Cloudflare Worker

Date: 2026-08-11

## Status

Accepted.

## Context

Web and the Liquid theme record marketing consent directly from the client, by
calling Klaviyo's `POST /client/subscriptions/` with the public key. That
endpoint exists precisely so untrusted clients can record consent without
holding a credential.

The Expo app cannot do the same. Three routes were tried, in this order, and
each was closed:

1. **Klaviyo's React Native SDK.** No consent API exists. `Profile` carries no
   subscriptions field and there is no subscribe method — identity and events
   only. Established by reading the SDK's own type definitions.

2. **`/client/subscriptions/` over `fetch`.** Cloudflare answers a React Native
   request with a **403 HTML interstitial**, not a Klaviyo response. Measured on
   one machine within the same minute:

   | Client       | `/client/profiles/` | `/client/subscriptions/` |
   | ------------ | ------------------- | ------------------------ |
   | Browser      | 202                 | 202                      |
   | React Native | —                   | **403, Cloudflare**      |

   So it is the shape of the client, not the address. Three header variants were
   tried — baseline, an honest identifying `User-Agent`, and that plus `Accept`
   — all blocked. Getting further would mean impersonating a browser, which is
   defeating bot protection rather than identifying a client, and was ruled out.

   ⚠️ Notably it did **not** fail on the first attempt hours earlier. The
   challenge escalates with repetition, which makes this the kind of dependency
   that passes a demo and fails a user.

3. **Klaviyo's in-app forms.** Their documentation states these *"cannot be used
   to collect consent or profile information yet"*. Display and analytics only.

## Decision

Consent is recorded by **`apps/api`, a Cloudflare Worker**, which holds a scoped
Klaviyo private key and calls the server-side
`POST /api/profile-subscription-bulk-create-jobs`.

This is what Klaviyo's own documentation prescribes for server-side
subscription, and it is the standard mobile pattern: a client in the user's
hands cannot hold a credential, so it delegates to a backend. The proxy itself
is unremarkable — the reasoning that made it necessary is the part worth having.

Identity stays with the SDK. Consent and identity are different claims and are
recorded by different systems, deliberately.

### Why a Worker rather than a route in `apps/web`

The credential would otherwise live in the storefront's environment — the
highest-traffic, most third-party-exposed surface in the project. Having argued
for a scoped key to limit what a leaked credential can *do*, putting it there
would undercut the same reasoning. A separate deployable isolates it.

Cloudflare over a second Vercel project for two reasons: rate limiting is a
platform primitive on the free tier, and the `workerd` runtime is the same one
Shopify's Oxygen is built on, so the constraints learned here transfer to
Hydrogen work.

## Consequences

### Security posture

The threat is **not** key theft. It is a confused deputy: a public endpoint that
acts on our behalf, where an attacker never needs the credential at all.
Controls, in order of how much they actually buy:

| Control | Effect |
| --- | --- |
| Payload constructed, never forwarded | Caller supplies an address and nothing else. The list id is worker config. Prevents choosing the destination list, setting arbitrary profile properties, or forging `custom_source`. |
| Scoped key — Lists and Profiles only | A leaked key adds addresses to a list. It cannot read the customer database. |
| Double opt-in on the list | Nobody is subscribed until they click a confirmation email, so abuse costs unsent confirmations rather than list poisoning. |
| Rate limit, 5/min per IP | A **Durable Object**, keyed on `CF-Connecting-IP` — edge-set and unspoofable, unlike `X-Forwarded-For`. See below: this is the second attempt. |
| Generic error responses | Klaviyo's errors describe the account. Forwarding them would make this an information-disclosure endpoint. |
| No CORS headers | A native caller needs none, and their absence stops browsers using it cross-origin. |
| No dependencies | Nothing in the supply chain to compromise. |
| No addresses in logs | Emails are personal data; outcomes and statuses are enough to diagnose with. |

### ⚠️ The first rate limiter did nothing

Cloudflare's `ratelimits` binding was used initially. It deployed cleanly,
appeared in the deploy output as `env.SUBSCRIBE_LIMITER (5 requests/60s)`, and
**enforced nothing** — `{"success":true}` on every call, verified across 30+
requests against a limit of 5/60s, in parallel bursts and in sequential runs
minutes apart.

Cloudflare's own documentation explains it: that API is *"permissive,
eventually consistent, and intentionally designed to not be used as an accurate
accounting system"*, with counters cached per-location and updated
asynchronously. A rate limiter **is** an accounting system. The primitive was
wrong for the job, a sentence in the docs said so, and only measuring the
behaviour revealed it.

A **Durable Object** replaced it. A DO is single-threaded and serialised — only
one request runs against a given object at a time — so strong consistency comes
from the execution model rather than configuration. That is exactly the
property the binding lacks. Verified after the change: five requests through,
`429` from the sixth, and the limit holds under a parallel burst.

Two things worth carrying forward:

1. **Every signal short of counting responses said it worked.** Config valid,
   binding present, deploy output confirming the limit, well-formed return
   value. A control that has not been observed *failing closed* has not been
   tested.
2. **A free native rate limiter was one of two reasons for choosing Cloudflare
   over Vercel.** That reason evaporated. The decision stands on the remaining
   one — runtime familiarity with `workerd`, which Shopify's Oxygen is built on
   — plus the sunk work, but it now rests on one leg rather than two.

### Considered: Firebase App Check

The idiomatic React Native answer is **Firebase App Check**, which attests that
a request comes from a genuine instance of your app — a stronger control than
rate limiting, because it answers "is this my app?" rather than "is this too
many requests?".

It was not taken for two reasons. Adopting one Firebase service means absorbing
the whole integration — native modules, `useFrameworks: "static"` on iOS
alongside two existing native modules, config files, a third vendor — for a
single endpoint, serving none of the other two surfaces. And more decisively:
App Check on iOS wraps App Attest, which requires an **Apple Developer
account** this project has deliberately deferred. The same gate applies to
`expo-app-integrity`, so attestation is unavailable here regardless of vendor.

On a team that already had Firebase, a Cloud Function with App Check would be
the obvious choice and this ADR would be much shorter.

### Deliberately not done

**App Attest / Play Integrity.** It is the correct answer to "only my genuine
app may call this", and it is disproportionate here: the asset is a demo store's
double-opt-in marketing list, and the cost is a stateful attestation protocol,
per-platform implementations, and a dev loop that cannot run on the simulator.

Also worth recording that attestation is what you reach for when you *cannot
authenticate the user*. Were the app to gain customer accounts, this endpoint
would take a customer token and the question would not arise.

**Turnstile, IP allow-lists, a shared secret in the app bundle.** The last is
extractable with `strings` and would be obfuscation presented as security.

### Costs accepted

- The mobile app now depends on a second deployment. If the worker is down,
  signup fails — the app's other functions are unaffected.
- ⚠️ The isolation argument **weakens with every secret added**. Today this
  worker holds one key. If it later also holds a Recharge token and Shopify
  webhook secrets, it becomes the highest-value target in the system. Still
  better than the storefront, but this note should be revisited rather than
  repeated as though it stayed equally true.
- Klaviyo API keys cannot be re-scoped after creation. Changing scope means
  rotating — which is a config change here rather than an app release, and is
  much of the point.

## Related

- [Integration: Klaviyo](../integration-klaviyo.md)
- [ADR 0005 — parity means design, not data](0005-parity-means-design-not-data.md)

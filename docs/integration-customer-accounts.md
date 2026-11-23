# Customer accounts

How a buyer signs in, and what that unlocks (SHO-70). Recharge's portal session
builds on this; see [integration-recharge.md](integration-recharge.md).

## The decision

Shopify's **Customer Account API** (the "new" customer accounts), not classic
accounts with passwords. Buyers sign in on Shopify's hosted page with their
email and a one-time code. No storefront ever sees or stores a password.

- **Why not classic accounts.** Shopify is retiring them, and they would mean
  building a password form, reset flow and lockout rules, all security-critical
  and none of it the point of this project.
- **What it costs.** Signing in leaves the site for shopify.com and comes back,
  and Shopify won't redirect to `localhost` or plain `http`, so local sign-in
  needs an HTTPS tunnel.

## How it works

OAuth 2.0 authorisation code flow, as a **public client** with PKCE: there is
no client secret anywhere, so the PKCE verifier is what stops a stolen code
being redeemed.

| Step                              | Web (`apps/web`)                                         |
| --------------------------------- | -------------------------------------------------------- |
| Start (`/account/login`)          | state, nonce and PKCE verifier into an httpOnly cookie   |
| Shopify's sign-in page            | email and one-time code                                  |
| Callback (`/account/authorize`)   | state checked, code exchanged, id token's nonce checked  |
| Tokens                            | httpOnly cookie, 30 days; access token renewed on expiry |
| Cart                              | attached to the buyer, so checkout opens signed in       |
| Sign out (`POST /account/logout`) | cookie and cart cleared, then Shopify's own logout       |

The protocol (URLs, PKCE, token exchange, refresh, id token checks) lives in
`packages/shopify/src/customer-account.ts`, so the app will send exactly what
web does. Storage and the browser hand-off stay per platform
([ADR 0005](adr/0005-parity-means-design-not-data.md)).

Things that are easy to get wrong, each now pinned by a test or a comment:

- **The GraphQL `Authorization` header has no `Bearer` prefix.**
- **Carts take the access token directly** in `buyerIdentity.customerAccessToken`.
  `storefrontCustomerAccessTokenCreate` is deprecated since 2025-01.
- **Signing out clears the cart.** It was attached to the buyer, so on a
  shared computer the next checkout would otherwise open as them.
- **The callback origin comes from the forwarded headers**, not
  `request.nextUrl.origin`, which named `localhost` for a `127.0.0.1` request.

## Setup (Shopify admin)

Sales channels → Headless → the storefront → **Customer Account API**:

1. **Client type: public.** Client id goes in `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`,
   the numeric shop id in `SHOPIFY_SHOP_ID`. Neither is secret.
2. **Callback URLs:** `https://<origin>/account/authorize` for every origin that
   serves the site: the production domain and any branch alias used for
   testing. Per-deployment preview URLs change on every push, so use the
   stable `web-git-<branch>-…vercel.app` alias.
3. **JavaScript origins:** the same origins, without a path.
4. **Logout URL:** `https://<origin>/`.

## Not built yet

- **The app.** Same flow through `expo-web-browser`, with the redirect scheme
  Shopify requires for native clients (`shop.<shop_id>.app://callback`) and
  tokens in the keychain.
- **Order history beyond the latest 20**, and order tracking.
- **The read-only Recharge portal**, which exchanges this session for a
  Recharge one.

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

| Step         | Web (`apps/web`)                                       | App (`apps/mobile`)                                        |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| Start        | `/account/login`: state, nonce, verifier in a cookie   | Sign in button: kept in memory while the sheet is open     |
| Sign-in page | redirect to Shopify                                    | `openAuthSessionAsync`, an ephemeral system sheet          |
| Callback     | `https://<origin>/account/authorize`                   | `shop.<shop id>.app://callback`                            |
| Checks       | state, then nonce in the id token                      | the same, through the shared module                        |
| Tokens       | httpOnly cookie, 30 days                               | keychain, one entry per token (Android's 2 KB value limit) |
| Renewal      | `/account/refresh` redirect                            | before each request, in `getUsableTokens`                  |
| Cart         | attached at sign-in; cleared at sign-out               | the same                                                   |
| Sign out     | `POST /account/logout`, then Shopify's logout redirect | a plain request to Shopify's logout URL (no redirect)      |

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
- **The app parses the callback itself** (`callbackParams`). React Native's
  `URLSearchParams` splits each pair on every `=`, which would truncate a code
  containing one.
- **The app's sheet is ephemeral**: no cookies shared with Safari, so signing
  out of the app can't leave the buyer signed in at shopify.com.
- **Expo Go can't test app sign-in.** It only receives `exp://` links, and
  Shopify requires `shop.<shop id>.app://`. Use a development build.

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
5. **For the app:** add `shop.100581966136.app://callback` as a callback URL.
   The app needs `EXPO_PUBLIC_SHOPIFY_SHOP_ID` and
   `EXPO_PUBLIC_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`; the shop id also adds the
   scheme to the build (app.config.ts).

The theme needs none of this: Shopify serves its account pages itself.

## Not built yet

- **Testing app sign-in on a device.** It needs a development build (SHO-24);
  Expo Go can't receive the callback.
- **Order history beyond the latest 20**, and order tracking.
- **The read-only Recharge portal**, which exchanges this session for a
  Recharge one.

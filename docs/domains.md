# Domains

The store's domain is `doublehelixsupplements.co.uk`, registered with and
served by Cloudflare DNS. Each surface has its own address.

| Address                              | Serves                                                    | DNS record                                   |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| `www.doublehelixsupplements.co.uk`   | The Next.js storefront, on Vercel                         | CNAME to the value Vercel shows, DNS only    |
| `doublehelixsupplements.co.uk`       | A 308 redirect to `www`, by Vercel                        | CNAME (flattened) to the same value          |
| `shop.doublehelixsupplements.co.uk`  | Shopify's primary domain: the Liquid theme and checkout   | CNAME to `shops.myshopify.com`, DNS only     |
| `api.doublehelixsupplements.co.uk`   | The API Worker (`apps/api`), once deployed with its route | Created by `wrangler deploy` (custom domain) |
| `hello@doublehelixsupplements.co.uk` | Email, forwarded by Cloudflare Email Routing              | MX and SPF, added by Email Routing           |

**DNS only, not proxied.** Vercel and Shopify each issue their own
certificate and run their own CDN. Behind Cloudflare's proxy as well, the two
would fight over TLS, and Shopify won't verify a proxied domain.

## Why checkout isn't on `www`

Shopify serves checkout on its **primary domain**, and only a domain whose DNS
points at Shopify can be one. `www` points at Vercel, so checkout needs its
own subdomain, and that subdomain also serves the Liquid theme: Shopify shows
the Online Store on its primary domain and redirects every other connected
domain there. So `shop.` is one address for both.

## While the store is a development store

`shop.` is connected and primary, but Shopify keeps serving a
password-protected development store from `tben140plus-xcorpito.myshopify.com`:
the theme redirects there and carts' `checkoutUrl` still uses it. The password
can't be removed on a development store, so `shop.` takes over when the store
moves to a paid plan. Nothing in this repository changes then: the web reads
`checkoutUrl` from the cart, and the theme uses Liquid's own URLs.

## Configuration that names the domain

- `SITE_URL` on Vercel, Production only:
  `https://www.doublehelixsupplements.co.uk`. Canonicals, Open Graph URLs and
  the sitemap are built from it (`apps/web/lib/site.ts`).
- `routes` in `apps/api/wrangler.jsonc`, and the app's
  `EXPO_PUBLIC_API_BASE_URL` once that is deployed.
- `APP_LINK_HOST` in `apps/mobile/app.config.ts`, with the files under
  `/.well-known/` from `apps/web/lib/app-links.ts`, so product and collection
  links open the app. They are 404s until `APPLE_TEAM_ID` and
  `ANDROID_CERT_SHA256` are set on Vercel.

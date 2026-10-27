# Runbook

What's watched, who hears about it, and what to do when something breaks.
It's written for one maintainer and a demo store, so "on call" means "the
maintainer, by email". [SHO-157](https://linear.app/shopify-project/issue/SHO-157)
records when paging tooling would earn its place.

## What's monitored

| Signal                   | Covers                                            | Where it lands                                                      |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------- |
| Sentry `web`             | Browser and server errors, error-boundary catches | Sentry, email alert on a new issue                                  |
| Sentry `app`             | JavaScript errors in the Expo app                 | Sentry, email alert on a new issue                                  |
| Sentry `worker`          | Uncaught Worker errors, Klaviyo rejections        | Sentry, email alert on a new issue                                  |
| Cloudflare observability | Every Worker request: status and log lines        | Cloudflare → Workers → `formulate-api` → Logs                       |
| Vercel Speed Insights    | Real visitors' LCP, CLS and INP                   | Vercel → `web` → Speed Insights                                     |
| Lighthouse CI (web)      | Lab performance and accessibility                 | GitHub Actions: each preview that builds, weekly on production      |
| Lighthouse CI (theme)    | Lab performance and accessibility                 | GitHub Actions: every PR (seconds unless the theme changed), weekly |
| Playwright e2e           | Browse, cart, search, accessibility scans         | GitHub Actions: each preview that builds                            |

None of them sees the theme's own JavaScript errors or Shopify checkout,
which Shopify runs. Previews only build for changes that can affect the web
app (`apps/web/vercel.json`, `ignoreCommand`), so an app-, theme- or
docs-only PR gets no web e2e or Lighthouse run. The theme's Lighthouse job
skips when its store secrets are missing.

**Not in place yet:**

- **Sentry DSNs:** the `web` DSN is pending in Vercel, and the `app` and
  `worker` projects don't exist yet. Until both are done, Sentry is off.
- **Uptime check:** one free Sentry uptime monitor on the production web
  URL is planned. Until then, an outage is noticed by people, not
  automatically.

## When an alert arrives

1. **Is it real and current?** Open the Sentry issue and check the event
   count, the first and last seen times, and the environment. One event from
   a preview deployment can wait; a climbing count in production can't.
2. **Is it us or a dependency?** Most failures here are upstream. Check the
   status pages under [Dependencies](#dependencies) before reading code.
3. **Did a deploy cause it?** Compare the issue's first-seen time with the
   latest production deployment in Vercel, the Worker's deploy history and
   the theme's last publish. If they line up, roll back first and debug
   afterwards.
4. **Write it down.** Record anything beyond a one-line fix in a Linear issue:
   what broke, how it was noticed, what fixed it, and what would have caught
   it sooner.

## Per surface

### Web (`apps/web`, Vercel)

- **Diagnose:**
  - Sentry `web` for the error and stack.
  - Vercel → Deployments → the deployment → Logs, for server output.
  - A Storefront failure (bad token, Shopify down) renders the readable
    error state in the page, not a crash. If the whole site shows it, the
    Storefront token or Shopify is the place to look.
- **Roll back:** Vercel → Deployments → the last good production
  deployment → **Instant Rollback**. It's immediate and needs no build.
  Then revert the bad commit on `main`, so the next deploy doesn't bring
  it back.
- **Secrets:** Vercel → Project → Settings → Environment Variables.
  Changing one only takes effect after a redeploy.

### Worker (`apps/api`, Cloudflare)

- **Diagnose:**
  - Sentry `worker`.
  - Cloudflare's request logs. They hold status codes and Klaviyo's message,
    never the email address.
  - A 429 is the rate limiter working.
  - A 502 with "rejected" means Klaviyo answered with an error, of any
    kind. The log line `klaviyo subscribe failed` has Klaviyo's status, and
    that decides the fix:
    - 401 or 403: the private key is revoked, rotated or lacks a scope.
      Rotate it (below).
    - 400 or 404: the request or the list id. Check `KLAVIYO_LIST_ID` still
      names a list.
    - 429: Klaviyo is rate limiting us. Wait; nothing to rotate.
    - 5xx: Klaviyo is down. Check its status page; nothing to rotate.
- **Roll back:**
  - **First, check the bad deploy didn't change a Durable Object.** The rate
    limiter is a Durable Object (`RATE_LIMITER`) with a migration in
    `wrangler.jsonc`. Cloudflare can refuse a rollback across a migration,
    and a rollback never reverts Durable Object storage. If the bad deploy
    added or changed a migration, don't roll back: revert on `main` and let
    the Deploy API workflow ship the fix forward.
  - Cloudflare → Workers → `formulate-api` → Deployments → the previous
    version → **Rollback**.
  - Or, from a checkout with Cloudflare credentials: `pnpm --filter
@formulate/api exec wrangler deployments list`, then `wrangler rollback
<version-id>` with the last version known to be good. Without an id it goes
back one version only, which is still bad if the last two deploys were.
  - Then revert on `main`. The Deploy API workflow redeploys on the next
    merge that touches the Worker.
- **Secrets:** `wrangler secret put <NAME>` or the Cloudflare dashboard,
  always as type **Secret**. They live only in Cloudflare; a deploy leaves
  them unchanged.

### Theme (`apps/theme`, Shopify)

- **Diagnose:**
  - Preview the theme in the editor.
  - Use the browser console on the storefront.
  - Run `pnpm --filter @formulate/theme lint`, which runs Theme Check.
  - Lighthouse CI flags performance and accessibility regressions on the PR.
- **Roll back:** Online Store → Themes → the previous theme in the theme
  library → **Publish**. Themes are pushed unpublished
  (`pnpm --filter @formulate/theme push`) and published by hand, so the last
  good version is always still in the library. Keep it there until the new
  one has been live for a day.

### App (`apps/mobile`, Expo)

- **Diagnose:**
  - Sentry `app` for JavaScript errors.
  - The Metro terminal when running in Expo Go.
  - Native crashes are only reported from a development or store build.
- **Roll back:** There's no store build or EAS Update channel yet, so
  rolling back means reverting the commit and restarting the dev server.
  With EAS Update in place, this becomes republishing the previous update.

## Dependencies

| Service    | Status page                         | What breaks without it                                                                           |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shopify    | https://www.shopifystatus.com       | Everything: catalogue, cart, checkout, theme                                                     |
| Vercel     | https://www.vercel-status.com       | The web storefront                                                                               |
| Cloudflare | https://www.cloudflarestatus.com    | App sign-ups; restock alerts, deletion, reviews and the subscription portal once their PRs merge |
| Klaviyo    | https://status.klaviyo.com          | Email sign-up, flows, back-in-stock; the shop keeps selling                                      |
| Recharge   | https://status.rechargepayments.com | Subscription pages and new subscriptions at checkout                                             |
| Sentry     | https://status.sentry.io            | Visibility only; nothing customer-facing                                                         |

## Leaked or compromised credentials

Rotate first, investigate second. The repository is public, so assume
anything committed has been copied, even if it was removed straight away.

| Credential                       | Rotate at                                              | Then update                                                                  |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Storefront API token             | Shopify admin → Headless channel → the storefront      | Vercel and EAS environment variables, then rebuild the app (see below)       |
| Klaviyo private key(s)           | Klaviyo → Settings → API keys (create new, revoke old) | `wrangler secret put` on the Worker                                          |
| Shopify app client secret        | Dev Dashboard → the app → Settings → rotate secret     | `wrangler secret put` on the Worker, once account deletion (#88) is deployed |
| Recharge Admin token             | Recharge → Apps → API tokens                           | `wrangler secret put` on the Worker, once the portal (#90) is deployed       |
| Cloudflare API token (CI deploy) | Cloudflare → My Profile → API Tokens                   | GitHub repository secret                                                     |
| Sentry auth token                | Sentry → Settings → Auth Tokens                        | Vercel environment variable                                                  |

**The app keeps the old Storefront token until it's rebuilt.**
`EXPO_PUBLIC_*` values are compiled into each app build, so a new value in
EAS changes nothing on phones that already have the app. In order:

1. Create the new token alongside the old one.
2. Update EAS and Vercel, redeploy web, and ship a new app build.
3. Revoke the old token once the new build is out. Phones that haven't
   updated then lose the catalogue until they do. That's the trade-off:
   revoke at once for a real leak, wait for the update otherwise.

Public by design, so they never need rotating for a leak:

- Sentry DSNs;
- the Klaviyo public site key;
- the PostHog project key.

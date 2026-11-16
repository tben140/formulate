# Runbook: the API Worker

`apps/api`, the Cloudflare Worker named `formulate-api`. This note says what is
live, what each route needs to work, and how to deploy, check and roll back.
The design reasoning is in [`apps/api/AGENTS.md`](../apps/api/AGENTS.md),
[ADR 0007](adr/0007-mobile-consent-goes-through-a-worker.md) and ADR 0012
(the anonymous order backup, on #108 until it lands); this is the operating
manual.

## What is live

| Address                                         | Status                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `https://api.doublehelixsupplements.co.uk`      | The Worker's custom domain, created by `wrangler deploy` from the `routes` entry (#254)                               |
| `https://formulate-api.<subdomain>.workers.dev` | The original address. Kept (`workers_dev: true`) while app builds, the pixel and the app's webhook URIs still name it |

The Worker was last deployed on **15 November 2026**, from a combined local
branch (`deploy/api-domain`): the October batch plus the order webhook and
`OrderBackup` (#108) and the campaign change log and `CampaignLog` (#211).
**Only code that carries all three Durable Object classes and all three
migration tags below may be deployed.** A branch whose `wrangler.jsonc` knows
only `v1` would publish a Worker without the campaign log and order routes,
and the webhooks Shopify already sends to them would start failing. That is
why the CI deploy workflow runs only by hand (#255). Which branches qualify
is a fact about the code, checked by the dry-run in step 3 below, not a list
to keep here.

### Routes

| Route                                                                 | From  | Who may call it                                                 | Needs                                                                                                                               |
| --------------------------------------------------------------------- | ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST /`, and any path not listed below: the app's newsletter sign-up | batch | Anyone; rate limited per IP by the `RateLimiter` Durable Object | `KLAVIYO_PRIVATE_KEY` (secret), `KLAVIYO_LIST_ID` (`vars`)                                                                          |
| `POST /webhooks/shopify/campaigns`                                    | #211  | Shopify, signed with the Double Helix app's client secret       | `SHOPIFY_APP_CLIENT_SECRET`, the `CampaignLog` Durable Object                                                                       |
| `GET /campaigns/log`                                                  | #211  | The campaigns CLI (`campaigns history`), with a bearer token    | `CAMPAIGN_LOG_TOKEN`                                                                                                                |
| `POST /webhooks/orders-create`                                        | #108  | Shopify, signed with the subscribing app's client secret        | `SHOPIFY_WEBHOOK_SECRET`, `POSTHOG_KEY`, the `OrderBackup` Durable Object. **503 while either secret is unset**, so Shopify retries |
| `POST /orders/counted`                                                | #108  | The checkout pixel; rate limited per IP                         | the `OrderBackup` Durable Object                                                                                                    |

Every route answers with a status and a short generic body. Nothing from
Klaviyo or Shopify is forwarded to a caller (`apps/api/AGENTS.md`).

### Secrets

Set with `pnpm --filter @formulate/api exec wrangler secret put <NAME>`;
listed with `wrangler secret list` (names only, never values). As of 16
November 2026:

| Name                                                                     | Read by                                      | State                                             |
| ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------- |
| `KLAVIYO_PRIVATE_KEY`                                                    | newsletter sign-up                           | set                                               |
| `SHOPIFY_APP_CLIENT_SECRET`                                              | campaigns webhook (#211)                     | set                                               |
| `CAMPAIGN_LOG_TOKEN`                                                     | `GET /campaigns/log` (#211)                  | set; the same value goes in the CLI's environment |
| `SHOPIFY_WEBHOOK_SECRET`                                                 | order webhook (#108)                         | **not set**: the route answers 503                |
| `POSTHOG_KEY`                                                            | order webhook (#108)                         | **not set**: the route answers 503                |
| `RECHARGE_ADMIN_TOKEN`                                                   | the Recharge portal (#136)                   | set early, for a route still in review            |
| `KLAVIYO_BACK_IN_STOCK_KEY`                                              | back-in-stock requests (#147)                | set early, for a route still in review            |
| `KLAVIYO_DELETION_KEY`                                                   | account deletion (#90)                       | set early, for a route still in review            |
| `JUDGEME_PRIVATE_TOKEN`                                                  | product reviews (#94)                        | set early, for a route still in review            |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STOREFRONT_TOKEN` | customer accounts and the portal (#136, #90) | set early, for routes still in review             |

A secret the deployed code does not read is harmless, and removing one would
break the branch that needs it when it lands. Leave them.

`SHOPIFY_WEBHOOK_SECRET` is the client secret of whichever app subscribes to
`orders/create`. If that is the Double Helix app, it is the same value as
`SHOPIFY_APP_CLIENT_SECRET` under a second name; when #108 lands, consider
reading one name.

### Durable Objects and migration tags

| Tag  | Class         | Holds                                                                                           |
| ---- | ------------- | ----------------------------------------------------------------------------------------------- |
| `v1` | `RateLimiter` | One object per IP: the request counts behind the per-IP limits                                  |
| `v2` | `CampaignLog` | One object per campaign record: its last fields and every change (#211, 5 Nov 2026)             |
| `v3` | `OrderBackup` | One object per order: the backup event, held until the pixel reports or ten minutes pass (#108) |

⚠️ Tags are applied in order and never reused. Cloudflare refuses a tag it has
already seen with different classes, and a branch that reuses `v2` for a new
class cannot deploy. The next Durable Object is `v4`, added below the others,
and every branch that deploys must carry all the earlier tags.

## Deploying

1. **Start from code that has all three classes and all three tags.** Today
   that is only a branch combining the batch with #108 and #211. After both
   land, the batch; after the batch lands, `main`.
2. **Run the tests.** `pnpm --filter @formulate/api test`. The combined code
   has 52.
3. **Dry-run and read the bindings.**
   `pnpm --filter @formulate/api exec wrangler deploy --dry-run --outdir /tmp/api-dry`
   must list `RATE_LIMITER`, `CAMPAIGN_LOG` and `ORDER_BACKUP`, the `vars`
   entry, and the `api.` route. If a class is missing, the merge dropped it:
   `git rerere` has silently replayed a stale conflict resolution here before,
   so merge with `-c rerere.enabled=false` and look at the dry-run, not the
   diff.
4. **Deploy.** `pnpm --filter @formulate/api deploy`, with a Cloudflare API
   token that can edit Workers in the shell's environment as
   `CLOUDFLARE_API_TOKEN`. The token is never committed and never printed.
5. **Check it** (below), then note the date and the branch in this file.

From CI, `.github/workflows/deploy-api.yml` runs only on **Run workflow**
(#255), and only from a branch that meets step 1. Its push trigger comes back
once #108 and #211 are on `main`.

A deploy never touches secrets or Durable Object data. Both persist across
versions.

## Checking it

From outside, with nothing but `curl`:

| Request                                            | Expect                                          |
| -------------------------------------------------- | ----------------------------------------------- |
| `GET https://api.doublehelixsupplements.co.uk/`    | `405`: alive, and the sign-up route refuses GET |
| `POST /` with `content-type: text/plain`           | `415`                                           |
| `POST /` with JSON `{}`                            | `400 {"ok":false,"reason":"invalid-email"}`     |
| `GET /campaigns/log` without a token               | `401`                                           |
| `POST /webhooks/orders-create` without a signature | `503` until the two secrets are set, then `401` |

Six quick `POST /` calls from one address should turn into `429` with
`"reason":"rate-limited"`: that proves the `RateLimiter` object is bound and
working, which the dry-run cannot.

From inside: `pnpm --filter @formulate/api exec wrangler tail` streams the
logs, which hold outcomes and status codes and never an email address or a key.
`wrangler deployments list` shows what is live and when it went up. The
Cloudflare dashboard (Workers & Pages → the Worker → Logs) has the same with
history, because `observability` is on.

## Going live with the rest

Still to do, in this order, each one reversible:

1. **Set `SHOPIFY_WEBHOOK_SECRET` and `POSTHOG_KEY`.** The order webhook then
   stops answering 503. Nothing else changes.
2. **Subscribe `orders/create`** to
   `https://api.doublehelixsupplements.co.uk/webhooks/orders-create`, in the
   app that owns the secret from step 1 (the steps are in
   `docs/integration-posthog.md`, on #108's branch until it lands).
3. **Install the checkout pixel** (same document), with its `API_URL` set to
   the `api.` address.
4. **Move the campaigns webhook** to the `api.` address: the `uri` in
   `apps/shopify-app/shopify.app.toml`, then `shopify app deploy` from that
   folder. Set `CAMPAIGNS_API_URL` for the campaigns CLI to match.
5. **Point the app at the `api.` address**: `EXPO_PUBLIC_API_BASE_URL` in EAS
   for the next build. Builds already on phones keep the old address inlined.
6. **Turn off `workers_dev`** only when nothing names the old address any more:
   no app build in use, not the pixel, not the webhook URIs.

## Rolling back

**Always name the version.** `pnpm --filter @formulate/api exec wrangler
deployments list` shows every version with its date and message; pick the last
known-good one and run `wrangler rollback <version-id>`. Not the bare
`wrangler rollback`: every `wrangler secret put` also creates a version, so
"the previous version" after a bad deploy followed by a secret change is the
bad deploy again, with the new secret. Secrets and Durable Object data are
untouched by a rollback.

**A rollback cannot cross a Durable Object migration.** Cloudflare refuses to
roll back to a version from before a class was added, so nothing before `v2`
or `v3` can be selected now, and the same will hold for `v4`. If the bad
version is the one that added a class, the way back is forward: fix the code,
keep the class and its tag, and deploy again. Never delete a class or reuse a
tag to "undo" one.

**Webhooks during a rollback.** A version without a route answers that route
with `404` or `405`, which Shopify counts as a failed delivery. Shopify retries
a failed delivery up to eight times over four hours, and removes a subscription
after enough consecutive failures. So a rollback that lasts under an hour loses
nothing; a longer one loses the order-backup events for orders in that window,
and there is no replay: those orders are counted only if the checkout pixel
reported them. After any outage past an hour, check the subscription still
exists (the Dev Dashboard app, or `shopify app webhooks` for the app's own) and
re-create it if not, and for the campaign log compare `campaigns history`
against the records' current fields and note any edit it missed.

## Related

- [Architecture](architecture.md) · [Domains](domains.md) · [Security](security.md)
- [Integration: Klaviyo](integration-klaviyo.md) · Integration: PostHog
  (`docs/integration-posthog.md`, on #108 until it lands)

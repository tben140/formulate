# Campaign Calendar

The Double Helix app's page inside the Shopify admin (SHO-205): every campaign on a calendar with the UK retail days, preview links, the go-live checklist, sign-off and the change log. One Cloudflare Worker serves the page and its API.

## How it works

- **The page** loads App Bridge first, which embeds it in the admin and adds a session token to its own `fetch` calls.
- **`/api/*`** verifies that token (`src/session.ts`): signature, our client id, expiry, and this one shop. It then trades it for an Admin token by **token exchange** (`src/shopify.ts`). That happens server-side, here only; the token is never stored and never reaches the browser.
- **The data and checks** are packages/campaigns, the same code as the `campaigns` CLI, so the checklist here is `campaigns check`.
- **Sign off** uses an _online_ token, so the name recorded is the staff member's own.

## Setting it up (Ben)

1. Deploy the Worker:

   ```bash
   pnpm --filter @formulate/campaign-calendar exec wrangler secret put SHOPIFY_APP_CLIENT_SECRET
   pnpm --filter @formulate/campaign-calendar exec wrangler secret put CAMPAIGN_PREVIEW_TOKEN   # optional: preview links
   pnpm --filter @formulate/campaign-calendar exec wrangler secret put CAMPAIGN_LOG_TOKEN       # optional: change log
   pnpm --filter @formulate/campaign-calendar run deploy
   ```

2. Deploy the app config. `apps/shopify-app/shopify.app.toml` points `application_url` at the Worker, with `embedded = true`. Deploy it with the full extension set, as for double-helix-10, so no extension is dropped.
3. In the admin: **Apps → Double Helix**.

## Not yet

- A QR code for the app preview link: today it's a "Copy" button.
- Klaviyo emails and pushes on the timeline: they need a Klaviyo key in the Worker.
- Polaris web components: the page is plain HTML and CSS for now.

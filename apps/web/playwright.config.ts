import { defineConfig, devices } from "@playwright/test";

import { VERCEL_AUTH_STATE } from "./e2e/global-setup";

/**
 * End-to-end tests for apps/web, against the real store.
 *
 * ⚠️ Not part of `turbo test`. These need `apps/web/.env.local` with a working
 * Storefront token, and they create real (throwaway) carts on the store, so
 * they run on demand: `pnpm --filter @formulate/web test:e2e`. See e2e/README.md.
 *
 * Against a **production build**, not `next dev`. Dev mode serves ~3.8 MB of
 * unbundled JavaScript that hydrates slowly enough to make timing-sensitive
 * tests flaky, and it is not what shoppers get.
 *
 * `@playwright/test` is pinned to an exact version on purpose: each release
 * expects one specific browser build (`pnpm exec playwright install chromium`).
 */
const PORT = 3200;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * A protected Vercel preview: e2e/global-setup.ts gets the bypass cookie once
 * and every test starts from it. See .github/workflows/e2e.yml.
 */
const behindVercelProtection = Boolean(
  process.env.E2E_BASE_URL && process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The store is shared and the tests are cheap: two at a time is plenty, and
  // keeps the Storefront API well inside its rate limits.
  workers: 2,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    ...(behindVercelProtection
      ? {
          storageState: VERCEL_AUTH_STATE,
          /*
           * Previews inject the Vercel Toolbar, which keeps a connection open,
           * so `waitUntil: "networkidle"` never resolves and every test times
           * out (the first CI run did exactly that). This header is Vercel's
           * documented switch for automation. It isn't sensitive, so sending
           * it everywhere is fine; the one side effect is that third-party
           * XHRs (Klaviyo) need a CORS preflight, and no test depends on them.
           */
          extraHTTPHeaders: { "x-vercel-skip-toolbar": "1" },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      // Chromium with iPhone metrics, not WebKit: the same engine as desktop, so
      // a difference between projects is a layout difference, not an engine one.
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  // Builds and serves the app unless E2E_BASE_URL points somewhere already
  // running (a preview deployment, or a server you started yourself).
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm build && pnpm start --port ${PORT} --hostname 127.0.0.1`,
          url: `${baseURL}/collections/best-sellers`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
      }),
});

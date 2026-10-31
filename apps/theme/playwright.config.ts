import { defineConfig, devices } from "@playwright/test";

/**
 * Accessibility scans of the Liquid theme (SHO-149), the theme's counterpart to
 * apps/web/e2e/accessibility.spec.ts.
 *
 * Runs against the real store, never `shopify theme dev`: theme dev's assets
 * come from the store CDN, which the browser blocks from 127.0.0.1 (CORS), so
 * none of the theme's JavaScript would run.
 *
 * - THEME_E2E_STORE: the store's domain, e.g. formulate.myshopify.com.
 * - THEME_E2E_PASSWORD: the storefront password (development stores always
 *   have one).
 * - THEME_E2E_THEME_ID: optional. A theme to preview instead of the published
 *   one; CI pushes the PR's theme unpublished and sets this.
 */
const store = process.env.THEME_E2E_STORE ?? "";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 2,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: store ? `https://${store}` : undefined,
    storageState: "e2e/.auth/store.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});

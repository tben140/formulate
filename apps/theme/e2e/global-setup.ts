import { mkdirSync } from "node:fs";

import { chromium, type FullConfig } from "@playwright/test";

/**
 * Gets past the storefront password once, and opens the theme under test, then
 * saves the cookies for every test to start from.
 *
 * `preview_theme_id` puts this browser on an unpublished theme for the rest of
 * the session (a cookie), and `pb=0` hides Shopify's preview bar, which is
 * Shopify's markup, not ours, and would be scanned along with the page.
 */
const globalSetup = async (config: FullConfig) => {
  const baseURL = config.projects[0]?.use.baseURL;
  const password = process.env.THEME_E2E_PASSWORD ?? "";
  if (!baseURL || !password) {
    throw new Error(
      "Set THEME_E2E_STORE and THEME_E2E_PASSWORD; see playwright.config.ts.",
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/password`);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForURL((url) => !url.pathname.startsWith("/password"));

  const themeId = process.env.THEME_E2E_THEME_ID;
  if (themeId) {
    await page.goto(`${baseURL}/?preview_theme_id=${encodeURIComponent(themeId)}&pb=0`);
  }

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/store.json" });
  await browser.close();
};

export default globalSetup;

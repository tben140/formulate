import { expect, test, type Page } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * Tracking consent is enforced by the absence of requests, so that's what
 * this checks: no tracker is contacted before the shopper accepts, or after
 * they decline. Every host is listed whether or not the deployment has ids
 * for it, so a tag added later without a consent check fails here.
 */
const TRACKERS =
  /klaviyo\.com|googletagmanager\.com|google-analytics\.com|facebook\.(net|com)|tiktok\.com|pinimg\.com|pinterest\.com|sc-static\.net|snapchat\.com|redditstatic\.com|reddit\.com|bing\.com/;

const recordTrackers = (page: Page): string[] => {
  const hosts: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (TRACKERS.test(url.hostname)) hosts.push(url.hostname);
  });
  return hosts;
};

const banner = (page: Page) => page.getByRole("region", { name: "Cookies" });

test("no tracker is contacted before consent", async ({ page }) => {
  const hosts = recordTrackers(page);
  await openProduct(page, "daily-multivitamin");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Shopping cart" })).toBeVisible();
  expect(hosts).toEqual([]);
});

test("no tracker is contacted after declining", async ({ page }) => {
  const hosts = recordTrackers(page);
  await openProduct(page, "daily-multivitamin");
  test.skip(
    !(await banner(page).isVisible()),
    "no trackers configured on this deployment",
  );

  await page.getByRole("button", { name: "Decline" }).click();
  await expect(banner(page)).toBeHidden();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Shopping cart" })).toBeVisible();
  await page.goto("/collections/best-sellers", { waitUntil: "networkidle" });
  expect(hosts).toEqual([]);
});

test("accepting loads the configured trackers", async ({ page }) => {
  const hosts = recordTrackers(page);
  await openProduct(page, "daily-multivitamin");
  test.skip(
    !(await banner(page).isVisible()),
    "no trackers configured on this deployment",
  );

  await page.getByRole("button", { name: "Accept" }).click();
  // The ad tags wait for the page to go idle; Klaviyo loads straight away.
  await expect.poll(() => hosts.length, { timeout: 10_000 }).toBeGreaterThan(0);
});

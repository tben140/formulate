import { expect, test, type Page } from "@playwright/test";

import { decideConsent } from "./helpers";

/**
 * Product search with filters (SHO-153). Results depend on the catalogue and
 * on Search & Discovery's settings, so these assert on products that should
 * always match rather than on exact counts.
 */

const results = (page: Page) =>
  page.locator('section[aria-labelledby="search-results"] a[href^="/products/"]');

const search = async (page: Page, term: string) => {
  await page.getByRole("searchbox", { name: "Search products" }).fill(term);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(term)}`));
};

test("the header's Search link opens product search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("search")).toBeVisible();
});

test("a search finds matching products", async ({ page }) => {
  await page.goto("/search");
  await search(page, "omega");
  await expect(results(page).filter({ hasText: "Omega-3 Fish Oil" })).toBeVisible();
  await expect(results(page).filter({ hasText: "Omega-3 Algae Oil" })).toBeVisible();
});

test("filters narrow search results and keep the search term", async ({ page }) => {
  await page.goto("/search?q=protein");
  await page.locator("summary", { hasText: "Filter" }).click();
  await page.getByLabel(/^Chocolate/).check();
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveURL(/q=protein/);
  await expect(page).toHaveURL(/filter\.v\.option\.flavour=Chocolate/);
  await expect(results(page).filter({ hasText: "Whey Protein" })).toBeVisible();
  await expect(results(page).filter({ hasText: "Plant Protein" })).toBeVisible();
  await expect(results(page).filter({ hasText: "Creatine" })).toHaveCount(0);
});

test("a search with no matches says so", async ({ page }) => {
  await page.goto("/search?q=zzzqqqxx");
  await expect(page.getByText(/No products match/)).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test.beforeEach(async ({ context, baseURL }) => decideConsent(context, baseURL));

  test("search still works: it's a plain form", async ({ page }) => {
    await page.goto("/search");
    await search(page, "omega");
    await expect(results(page).filter({ hasText: "Omega-3 Fish Oil" })).toBeVisible();
  });
});

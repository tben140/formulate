import { expect, test } from "@playwright/test";

/**
 * Collection pagination (SHO-44). Every demo collection fits on one page of
 * 24, so these check the edges: no pagination when there's one page, and a bad
 * cursor in a link falls back to the first page instead of an error. Paging
 * itself is unit-tested in packages/shopify (pagination.test.ts) and was
 * checked by hand at 4 per page.
 */

test("a collection that fits on one page has no pagination", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pagination" })).toHaveCount(0);
});

test("a malformed cursor shows the first page, not an error", async ({ page }) => {
  const response = await page.goto("/collections/best-sellers?after=not%20a%20cursor!");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Best Sellers" }),
  ).toBeVisible();
  await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible();
});

test("the first page's canonical is the bare collection URL", async ({ page }) => {
  await page.goto("/collections/best-sellers?filter.v.availability=1");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/collections\/best-sellers$/,
  );
});

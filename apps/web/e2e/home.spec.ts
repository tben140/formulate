import { expect, test } from "@playwright/test";

/**
 * The home page (SHO-61). Its categories and featured collection come from the
 * Shopify menu "Shop": the categories are its collections, the featured one
 * its first.
 */
test("home introduces the shop, lists categories and features the first collection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shop Best Sellers" })).toHaveAttribute(
    "href",
    "/collections/best-sellers",
  );

  const categories = page.locator("section", {
    has: page.getByRole("heading", { name: "Shop by category" }),
  });
  await expect(categories.getByRole("link")).toHaveCount(6);

  const featured = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Best Sellers" }),
  });
  await expect(featured.getByRole("link", { name: /View all/ })).toHaveAttribute(
    "href",
    "/collections/best-sellers",
  );
  expect(await featured.locator('a[href^="/products/"]').count()).toBeGreaterThan(0);
});

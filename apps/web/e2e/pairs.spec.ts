import { expect, test, type Page } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * "Pairs well with" (SHO-153): the complementary products set per product in
 * Search & Discovery. The pairings are store data (see SHO-153 for the list);
 * if these fail after an edit there, the store changed, not the code.
 */

const pairs = (page: Page) =>
  page.locator("section", {
    has: page.getByRole("heading", { name: "Pairs well with" }),
  });

test("a product shows the products it pairs with", async ({ page }) => {
  await openProduct(page, "whey-protein");
  await expect(
    pairs(page).getByRole("link", { name: /Creatine Monohydrate/ }),
  ).toBeVisible();
  await expect(pairs(page).getByRole("link", { name: /Marine Collagen/ })).toBeVisible();
});

test("a sold-out pairing is left out", async ({ page }) => {
  // Citicoline pairs with L-Theanine and Lion's Mane, which the demo store
  // holds sold out (back-in-stock testing). Shopify omits unavailable products.
  await openProduct(page, "citicoline");
  await expect(pairs(page).getByRole("link", { name: /L-Theanine/ })).toBeVisible();
  await expect(pairs(page).getByRole("link", { name: /Lion's Mane/ })).toHaveCount(0);
});

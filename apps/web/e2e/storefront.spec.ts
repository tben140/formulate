import { expect, test } from "@playwright/test";

import { openProduct } from "./helpers";

test("a collection renders its products", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  await expect(
    page.getByRole("heading", { level: 1, name: "Best Sellers" }),
  ).toBeVisible();
  // Each product is a link to its page, with a price.
  const cards = page.locator('main a[href^="/products/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toContainText("£");
});

test("a product page renders title, price and a buyable button", async ({ page }) => {
  await openProduct(page, "whey-protein");
  await expect(
    page.getByRole("heading", { level: 1, name: "Whey Protein" }),
  ).toBeVisible();
  await expect(page.getByText(/£\d+\.\d{2}/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to cart", exact: true }),
  ).toBeEnabled();
});

/**
 * Relies on the demo store's stock plan: Magnesium Glycinate 200 mg is held at
 * zero (docs/demo-store.md). If this fails after a stock reset, check the plan
 * before the code.
 */
test("a sold-out option is marked and cannot be bought", async ({ page }) => {
  await openProduct(page, "magnesium-glycinate");
  // What a screen reader announces, and what a sighted shopper sees.
  const soldOut = page.getByRole("radio", { name: "200 mg (sold out)" });
  await expect(soldOut).toBeAttached();
  await expect(page.locator("label", { hasText: "200 mg" })).toHaveClass(/line-through/);

  await page.locator("label", { hasText: "200 mg" }).click();
  // `exact`: on a phone the sticky bar (SHO-117) adds a second, differently
  // named "Sold out, …" button.
  await expect(
    page.getByRole("button", { name: "Sold out", exact: true }),
  ).toBeDisabled();
});

test("an unknown product is a 404", async ({ page }) => {
  const response = await page.goto("/products/this-product-does-not-exist");
  expect(response?.status()).toBe(404);
});

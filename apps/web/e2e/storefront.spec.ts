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
 * Relies on the demo store's stock plan: **Magnesium Glycinate 200 mg is held
 * at 0 available** (inventory tracked, `inventoryPolicy: DENY`), while the
 * product's other variant stays in stock. If this fails after a stock reset,
 * set that variant back to 0 before suspecting the code. The full plan is in
 * docs/demo-store.md (added with the demo-store notice, #26).
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

test("the product photo keeps its own shape beside a tall details column", async ({
  page,
}) => {
  // At 768 px the details column was 961 px tall and the photo stretched to
  // match, cropped to fit. Checked at the widths where the two columns sit
  // side by side, and at phone width.
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/products/magnesium-glycinate");
    const photo = page.locator("main img").first();
    await expect(photo).toBeVisible();
    const { shown, natural } = await photo.evaluate((img: HTMLImageElement) => {
      const box = img.getBoundingClientRect();
      return {
        shown: box.width / box.height,
        natural: img.naturalWidth / img.naturalHeight,
      };
    });
    expect(Math.abs(shown - natural), `at ${width}px`).toBeLessThan(0.02);
  }
});

test("a one-image product shows a plain photo, not a carousel", async ({ page }) => {
  // Every product in the store has one image today. With more, the gallery
  // becomes a swipeable carousel (components/product-gallery.tsx); until the
  // store has such a product, this pins the single-image case: no arrows,
  // thumbnails or count, and the photo is still the eager LCP image.
  await page.goto("/products/magnesium-glycinate");
  const photo = page.locator("main img").first();
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("loading", "eager");
  await expect(page.locator('[aria-roledescription="carousel"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Next|Previous) image$/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^Show image/ })).toHaveCount(0);
});

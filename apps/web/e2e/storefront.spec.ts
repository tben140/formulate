import { expect, test } from "@playwright/test";

import { openProduct } from "./helpers";

test("a collection renders its products", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  await expect(
    page.getByRole("heading", { level: 1, name: "Best Sellers" }),
  ).toBeVisible();
  // Each product is a link to its page, with a price.
  // A product card is a link in the page with a price in it, which keeps the
  // breadcrumb's links out without leaning on markup.
  const cards = page.getByRole("main").getByRole("link").filter({ hasText: "£" });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toHaveAttribute("href", /^\/products\/[^/]+$/);
});

/**
 * The first card's image is the Largest Contentful Paint at every column count,
 * so it alone is eager and high priority. Every other card is lazy: React
 * preloads each eager image in <head>, and several raced the LCP image on a
 * phone (SHO-148). A hard-coded "first row" broke when the column count
 * changed; this holds for any layout.
 */
for (const path of ["/collections/best-sellers", "/search?q=vitamin"]) {
  test(`only the first card's image loads first on ${path}`, async ({ page }) => {
    await page.goto(path);
    const images = page.locator("main li img");
    await expect(images.first()).toBeVisible();
    expect(await images.count(), "a grid of several").toBeGreaterThan(1);
    await expect(page.locator('main li img:not([loading="lazy"])')).toHaveCount(1);
    await expect(page.locator('main li img[fetchpriority="high"]')).toHaveCount(1);
    await expect(images.first()).toHaveAttribute("loading", "eager");
    await expect(images.first()).toHaveAttribute("fetchpriority", "high");
  });
}

test("a search with no results links back to the collections", async ({ page }) => {
  await page.goto("/search?q=zzqxnomatch");
  await expect(page.getByText("No products match “zzqxnomatch”")).toBeVisible();
  await page.getByRole("link", { name: "browse the collections" }).click();
  await expect(page).toHaveURL(/\/$/);
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
 * Needs one variant sold out (inventory tracked, `inventoryPolicy: DENY`)
 * while its product's other variant stays in stock. The demo store's plan
 * holds **Magnesium Glycinate 200 mg at 0 available** (docs/demo-store.md,
 * added with #26). When that variant is back in stock, as before a sale, the
 * test is skipped and says why, rather than failing on the store's stock.
 */
const SOLD_OUT = { handle: "magnesium-glycinate", option: "200 mg" };

test("a sold-out option is marked and cannot be bought", async ({ page }) => {
  await openProduct(page, SOLD_OUT.handle);
  // The label holds the radio's name, "(sold out)" included for screen readers.
  const label = page.locator("label", { hasText: SOLD_OUT.option });
  await expect(label).toBeAttached();
  test.skip(
    !((await label.textContent()) ?? "").includes("(sold out)"),
    `${SOLD_OUT.handle} ${SOLD_OUT.option} is in stock; the stock plan needs it at 0`,
  );

  // What a screen reader announces, and what a sighted shopper sees.
  await expect(
    page.getByRole("radio", { name: `${SOLD_OUT.option} (sold out)` }),
  ).toBeAttached();
  await expect(page.locator("label", { hasText: SOLD_OUT.option })).toHaveClass(
    /line-through/,
  );

  // The label's text includes its screen-reader-only "(sold out)".
  await page.getByText(`${SOLD_OUT.option} (sold out)`, { exact: true }).click();
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

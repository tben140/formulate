import { expect, test, type Page } from "@playwright/test";

import { decideConsent } from "./helpers";

/**
 * Collection filters (SHO-153), configured in Search & Discovery. Uses the
 * Performance collection: 6 products, 2 of them in Vanilla, 2 at or under £20.
 * If a test fails after a catalogue change, check those numbers first.
 */

const products = (page: Page) => page.locator('main ul.grid a[href^="/products/"]');

test("ticking a filter narrows the collection, and its chip removes it", async ({
  page,
}) => {
  await page.goto("/collections/performance");
  await expect(products(page)).toHaveCount(6);

  await page.locator("summary", { hasText: "Filter" }).click();
  await page.getByLabel(/^Vanilla/).check();
  await page.getByRole("button", { name: "Apply" }).click();

  // The URL is the Liquid theme's format, so the same link works there.
  await expect(page).toHaveURL(
    /\/collections\/performance\?filter\.v\.option\.flavour=Vanilla$/,
  );
  await expect(products(page)).toHaveCount(2);

  const chips = page.getByRole("list", { name: "Active filters" });
  await chips.getByRole("link", { name: /Flavour: Vanilla/ }).click();
  await expect(page).toHaveURL(/\/collections\/performance$/);
  await expect(products(page)).toHaveCount(6);
});

test("empty price fields are tidied out of the URL", async ({ page }) => {
  await page.goto(
    "/collections/performance?filter.v.price.gte=&filter.v.price.lte=&filter.v.option.flavour=Vanilla",
  );
  await expect(page).toHaveURL(
    /\/collections\/performance\?filter\.v\.option\.flavour=Vanilla$/,
  );
});

test("a price range filters, and an impossible one shows the empty state", async ({
  page,
}) => {
  await page.goto("/collections/performance?filter.v.price.lte=20");
  await expect(products(page)).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Price: Up to £20/ })).toBeVisible();

  await page.goto("/collections/performance?filter.v.price.lte=5");
  await expect(page.getByText("No products match these filters.")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test.beforeEach(async ({ context, baseURL }) => decideConsent(context, baseURL));

  test("filters still work: the panel is a plain form", async ({ page }) => {
    await page.goto("/collections/performance");
    await page.locator("summary", { hasText: "Filter" }).click();
    await page.getByLabel(/^Vanilla/).check();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(products(page)).toHaveCount(2);
  });
});

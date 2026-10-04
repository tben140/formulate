import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG 2.2 AA scans of the theme (SHO-149), the same rules and pages as web's
 * suite. See playwright.config.ts for how it reaches the store.
 */

/** WCAG 2.2 AA, the project's target (SHO-92). */
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

/** Violations as "rule: selector" lines, so a failure says what and where. */
const summary = (violations: Awaited<ReturnType<typeof scan>>["violations"]) =>
  violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));

/**
 * Waits for the theme's components to upgrade, so the scan sees the page as a
 * shopper does. Not `networkidle`: the store's Klaviyo scripts keep polling.
 */
const open = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForFunction(() => customElements.get("cart-drawer") !== undefined);
};

for (const path of [
  "/",
  "/collections/best-sellers",
  "/products/whey-protein",
  // A sold-out variant on an in-stock product (docs/demo-store.md).
  "/products/magnesium-glycinate",
  // Sold out entirely.
  "/products/lions-mane-mushroom",
  "/search?q=omega",
  "/products/this-product-does-not-exist",
]) {
  test(`no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
    await open(page, path);
    expect(summary((await scan(page)).violations)).toEqual([]);
  });
}

test("no WCAG 2.2 AA violations with the cart drawer open", async ({ page }) => {
  await open(page, "/products/daily-multivitamin");
  await page.locator("product-form button[type=submit]").first().click();
  await expect(page.locator("cart-drawer dialog[open]")).toBeVisible();
  expect(summary((await scan(page)).violations)).toEqual([]);
});

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { addToCart, openProduct } from "./helpers";

/** WCAG 2.2 AA, the project's target (SHO-92). */
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

/** Violations as "rule: selector" lines, so a failure says what and where. */
const summary = (violations: Awaited<ReturnType<typeof scan>>["violations"]) =>
  violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));

for (const path of [
  "/collections/best-sellers",
  "/products/whey-protein",
  "/products/magnesium-glycinate",
  "/products/daily-multivitamin",
  "/products/this-product-does-not-exist",
]) {
  test(`no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(summary((await scan(page)).violations)).toEqual([]);
  });
}

test("no WCAG 2.2 AA violations with the cart drawer open", async ({ page }) => {
  await openProduct(page, "daily-multivitamin");
  await addToCart(page);
  expect(summary((await scan(page)).violations)).toEqual([]);
});

test("no WCAG 2.2 AA violations on the add-to-cart confirmation", async ({ page }) => {
  test.fail(
    true,
    "SHO-133: success green is 3.30:1; fixed by PR #35, remove once merged",
  );

  await openProduct(page, "daily-multivitamin");
  await addToCart(page);
  await page.keyboard.press("Escape");
  expect(summary((await scan(page)).violations)).toEqual([]);
});

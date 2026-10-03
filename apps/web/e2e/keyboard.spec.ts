import { expect, test, type Page } from "@playwright/test";

import { cartButton, drawer, openProduct } from "./helpers";

/** Presses Tab until `target` has focus, failing after `max` presses. */
const tabTo = async (page: Page, target: ReturnType<Page["locator"]>, max = 40) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target}`);
};

// Keyboard behaviour is the same at every width; the desktop project covers it.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop only");

test("keyboard-only: collection to cart, with focus moved into the drawer", async ({
  page,
}) => {
  await page.goto("/collections/best-sellers", { waitUntil: "networkidle" });
  const card = page.locator('main a[href="/products/whey-protein"]');
  await tabTo(page, card);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/products\/whey-protein/);
  await page.waitForLoadState("networkidle");

  const add = page.getByRole("button", { name: "Add to cart", exact: true });
  await tabTo(page, add);
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole("button", { name: "Close cart" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
});

test("the drawer returns focus to the header button that opened it", async ({ page }) => {
  await openProduct(page, "daily-multivitamin");
  await cartButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cartButton(page)).toBeFocused();
});

test("the drawer returns focus to Add to cart that opened it", async ({ page }) => {
  await openProduct(page, "daily-multivitamin");
  const add = page.getByRole("button", { name: "Add to cart", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused({ timeout: 3_000 });
});

test("option pills show where keyboard focus is", async ({ page }) => {
  await openProduct(page, "whey-protein");
  const vanilla = page.getByRole("radio", { name: "Vanilla" });
  await tabTo(page, vanilla);
  const outline = await vanilla.evaluate((el) => {
    const style = getComputedStyle(el.closest("label") ?? el);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  });
  expect(outline).toBe("solid 2px");
});

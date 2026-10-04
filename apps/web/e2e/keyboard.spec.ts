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

test("the first Tab reaches Skip to content, which jumps past the header", async ({
  page,
}) => {
  await page.goto("/collections/best-sellers", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  // The next stop is inside the page, not the header's collection links.
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement?.closest("main") !== null),
  ).toBe(true);
});

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
  // Known bug, fixed by PR #37. Remove this line once it merges: Playwright
  // will report the test as unexpectedly passing until then.
  test.fail(
    true,
    "SHO-134: focus drops to <body>, because the button is disabled mid-add",
  );

  await openProduct(page, "daily-multivitamin");
  const add = page.getByRole("button", { name: "Add to cart", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused({ timeout: 3_000 });
});

test("option pills show where keyboard focus is", async ({ page }) => {
  test.fail(true, "SHO-128: fixed by PR #28; remove this line once it merges");

  await openProduct(page, "whey-protein");
  const vanilla = page.getByRole("radio", { name: "Vanilla" });
  await tabTo(page, vanilla);
  const outline = await vanilla.evaluate((el) => {
    const style = getComputedStyle(el.closest("label") ?? el);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  });
  expect(outline).toBe("solid 2px");
});

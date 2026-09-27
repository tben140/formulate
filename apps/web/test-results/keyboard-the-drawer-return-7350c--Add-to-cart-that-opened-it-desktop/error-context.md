# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard.spec.ts >> the drawer returns focus to Add to cart that opened it
- Location: e2e/keyboard.spec.ts:46:5

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('button', { name: 'Add to cart', exact: true })
Expected: focused
Received: inactive
Timeout:  3000ms

Call log:
  - Expect "toBeFocused" getByRole('button', { name: 'Add to cart', exact: true }) with timeout 3000ms
  - waiting for getByRole('button', { name: 'Add to cart', exact: true })
    10 × locator resolved to <button type="submit" class="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-surface hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300">Add to cart</button>
       - unexpected value "inactive"

```

```yaml
- button "Add to cart"
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | 
  3  | import { cartButton, drawer, openProduct } from "./helpers";
  4  | 
  5  | /** Presses Tab until `target` has focus, failing after `max` presses. */
  6  | const tabTo = async (page: Page, target: ReturnType<Page["locator"]>, max = 40) => {
  7  |   for (let i = 0; i < max; i++) {
  8  |     await page.keyboard.press("Tab");
  9  |     if (await target.evaluate((el) => el === document.activeElement)) return;
  10 |   }
  11 |   throw new Error(`Tab never reached ${target}`);
  12 | };
  13 | 
  14 | // Keyboard behaviour is the same at every width; the desktop project covers it.
  15 | test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop only");
  16 | 
  17 | test("keyboard-only: collection to cart, with focus moved into the drawer", async ({
  18 |   page,
  19 | }) => {
  20 |   await page.goto("/collections/best-sellers", { waitUntil: "networkidle" });
  21 |   const card = page.locator('main a[href="/products/whey-protein"]');
  22 |   await tabTo(page, card);
  23 |   await page.keyboard.press("Enter");
  24 |   await page.waitForURL(/\/products\/whey-protein/);
  25 |   await page.waitForLoadState("networkidle");
  26 | 
  27 |   const add = page.getByRole("button", { name: "Add to cart", exact: true });
  28 |   await tabTo(page, add);
  29 |   await page.keyboard.press("Enter");
  30 |   await expect(drawer(page)).toBeVisible();
  31 |   await expect(drawer(page).getByRole("button", { name: "Close cart" })).toBeFocused();
  32 | 
  33 |   await page.keyboard.press("Escape");
  34 |   await expect(drawer(page)).toBeHidden();
  35 | });
  36 | 
  37 | test("the drawer returns focus to the header button that opened it", async ({ page }) => {
  38 |   await openProduct(page, "daily-multivitamin");
  39 |   await cartButton(page).focus();
  40 |   await page.keyboard.press("Enter");
  41 |   await expect(drawer(page)).toBeVisible();
  42 |   await page.keyboard.press("Escape");
  43 |   await expect(cartButton(page)).toBeFocused();
  44 | });
  45 | 
  46 | test("the drawer returns focus to Add to cart that opened it", async ({ page }) => {
  47 |   // Known bug, fixed by PR #37. Remove this line once it merges: Playwright
  48 |   // will report the test as unexpectedly passing until then.
  49 |   test.fail(
  50 |     true,
  51 |     "SHO-134: focus drops to <body>, because the button is disabled mid-add",
  52 |   );
  53 | 
  54 |   await openProduct(page, "daily-multivitamin");
  55 |   const add = page.getByRole("button", { name: "Add to cart", exact: true });
  56 |   await add.focus();
  57 |   await page.keyboard.press("Enter");
  58 |   await expect(drawer(page)).toBeVisible();
  59 |   await page.keyboard.press("Escape");
> 60 |   await expect(add).toBeFocused({ timeout: 3_000 });
     |                     ^ Error: expect(locator).toBeFocused() failed
  61 | });
  62 | 
  63 | test("option pills show where keyboard focus is", async ({ page }) => {
  64 |   test.fail(true, "SHO-128: fixed by PR #28; remove this line once it merges");
  65 | 
  66 |   await openProduct(page, "whey-protein");
  67 |   const vanilla = page.getByRole("radio", { name: "Vanilla" });
  68 |   await tabTo(page, vanilla);
  69 |   const outline = await vanilla.evaluate((el) => {
  70 |     const style = getComputedStyle(el.closest("label") ?? el);
  71 |     return `${style.outlineStyle} ${style.outlineWidth}`;
  72 |   });
  73 |   expect(outline).toBe("solid 2px");
  74 | });
  75 | 
```
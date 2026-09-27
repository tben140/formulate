# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard.spec.ts >> option pills show where keyboard focus is
- Location: e2e/keyboard.spec.ts:63:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "solid 2px"
Received: "none 3px"
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - link "Formulate" [ref=e4] [cursor=pointer]:
        - /url: /
      - button "Open cart, empty" [ref=e5]: Cart
  - main [ref=e6]:
    - article [ref=e7]:
      - img "Double Helix Whey Protein Vanilla concept packshot on a warm off-white background" [ref=e9]
      - generic [ref=e10]:
        - link "← Back to collection" [ref=e11] [cursor=pointer]:
          - /url: /collections/automated-collection
        - heading "Whey Protein" [level=1] [ref=e12]
        - paragraph [ref=e13]: Double Helix Whey Protein is a 30-day protein-powder format with flavour and sweetener choices.This is a draft catalogue item. Final ingredients, recommended use, warnings and market-specific legal information will be supplied after formula and regulatory approval.
        - generic [ref=e14]:
          - group "Flavour" [ref=e15]:
            - generic [ref=e17]:
              - generic [ref=e18] [cursor=pointer]:
                - radio "Vanilla" [checked] [active] [ref=e19]
                - text: Vanilla
              - generic [ref=e20] [cursor=pointer]:
                - radio "Chocolate" [ref=e21]
                - text: Chocolate
              - generic [ref=e22] [cursor=pointer]:
                - radio "Strawberry" [ref=e23]
                - text: Strawberry
          - group "Sweetening" [ref=e24]:
            - generic [ref=e26]:
              - generic [ref=e27] [cursor=pointer]:
                - radio "Sweetened" [checked] [ref=e28]
                - text: Sweetened
              - generic [ref=e29] [cursor=pointer]:
                - radio "Unsweetened" [ref=e30]
                - text: Unsweetened
          - paragraph [ref=e31]: £32.95
          - button "Add to cart" [ref=e32]
          - status
  - contentinfo [ref=e33]:
    - generic [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]: Get restock and subscription news
        - generic [ref=e37]:
          - textbox "Get restock and subscription news" [ref=e38]:
            - /placeholder: you@company.com
          - button "Sign up" [ref=e39]
        - paragraph [ref=e40]: Marketing emails about restocks and subscription offers. Unsubscribe any time.
        - status [ref=e41]
      - paragraph [ref=e42]: © 2026 Formulate
  - alert [ref=e43]
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
  60 |   await expect(add).toBeFocused({ timeout: 3_000 });
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
> 73 |   expect(outline).toBe("solid 2px");
     |                   ^ Error: expect(received).toBe(expected) // Object.is equality
  74 | });
  75 | 
```
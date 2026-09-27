# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> no WCAG 2.2 AA violations on the add-to-cart confirmation
- Location: e2e/accessibility.spec.ts:35:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "color-contrast: .mt-3 > .text-success",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - link "Formulate" [ref=e4] [cursor=pointer]:
        - /url: /
      - button "Open cart, 1 item" [ref=e5]:
        - text: Cart
        - generic [aria-hidden] [ref=e6]: "1"
  - main [ref=e7]:
    - article [ref=e8]:
      - img "Double Helix Daily Multivitamin concept packshot on a warm off-white background" [ref=e10]
      - generic [ref=e11]:
        - link "← Back to collection" [ref=e12] [cursor=pointer]:
          - /url: /collections/automated-collection
        - heading "Daily Multivitamin" [level=1] [ref=e13]
        - paragraph [ref=e14]: Double Helix Daily Multivitamin is a 30-day multivitamin tablet format.This is a draft catalogue item. Final ingredients, recommended use, warnings and market-specific legal information will be supplied after formula and regulatory approval.
        - generic [ref=e15]:
          - paragraph [ref=e16]: £15.95
          - button "Add to cart" [ref=e17]
          - status [ref=e18]: Added to your cart.
  - contentinfo [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]: Get restock and subscription news
        - generic [ref=e23]:
          - textbox "Get restock and subscription news" [ref=e24]:
            - /placeholder: you@company.com
          - button "Sign up" [ref=e25]
        - paragraph [ref=e26]: Marketing emails about restocks and subscription offers. Unsubscribe any time.
        - status [ref=e27]
      - paragraph [ref=e28]: © 2026 Formulate
  - alert [ref=e29]
```

# Test source

```ts
  1  | import { AxeBuilder } from "@axe-core/playwright";
  2  | import { expect, test, type Page } from "@playwright/test";
  3  | 
  4  | import { addToCart, openProduct } from "./helpers";
  5  | 
  6  | /** WCAG 2.2 AA, the project's target (SHO-92). */
  7  | const scan = (page: Page) =>
  8  |   new AxeBuilder({ page })
  9  |     .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  10 |     .analyze();
  11 | 
  12 | /** Violations as "rule: selector" lines, so a failure says what and where. */
  13 | const summary = (violations: Awaited<ReturnType<typeof scan>>["violations"]) =>
  14 |   violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
  15 | 
  16 | for (const path of [
  17 |   "/collections/best-sellers",
  18 |   "/products/whey-protein",
  19 |   "/products/magnesium-glycinate",
  20 |   "/products/daily-multivitamin",
  21 |   "/products/this-product-does-not-exist",
  22 | ]) {
  23 |   test(`no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
  24 |     await page.goto(path, { waitUntil: "networkidle" });
  25 |     expect(summary((await scan(page)).violations)).toEqual([]);
  26 |   });
  27 | }
  28 | 
  29 | test("no WCAG 2.2 AA violations with the cart drawer open", async ({ page }) => {
  30 |   await openProduct(page, "daily-multivitamin");
  31 |   await addToCart(page);
  32 |   expect(summary((await scan(page)).violations)).toEqual([]);
  33 | });
  34 | 
  35 | test("no WCAG 2.2 AA violations on the add-to-cart confirmation", async ({ page }) => {
  36 |   test.fail(
  37 |     true,
  38 |     "SHO-133: success green is 3.30:1; fixed by PR #35, remove once merged",
  39 |   );
  40 | 
  41 |   await openProduct(page, "daily-multivitamin");
  42 |   await addToCart(page);
  43 |   await page.keyboard.press("Escape");
> 44 |   expect(summary((await scan(page)).violations)).toEqual([]);
     |                                                  ^ Error: expect(received).toEqual(expected) // deep equality
  45 | });
  46 | 
```
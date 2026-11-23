import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared steps. Each test gets a fresh browser context, so a fresh cart
 * cookie: tests never see each other's carts.
 */

/** The cart drawer, by its accessible name. */
export const drawer = (page: Page) => page.getByRole("dialog", { name: "Shopping cart" });

/** The header's cart button, whatever its count. */
export const cartButton = (page: Page) =>
  page.getByRole("button", { name: /^Open cart/ });

/**
 * Opens a product page and waits for hydration. The form is a Server Action,
 * so clicking before React attaches submits it natively and reloads the page.
 */
export const openProduct = async (page: Page, handle: string) => {
  await page.goto(`/products/${handle}`, { waitUntil: "networkidle" });
};

/** Adds whatever is selected and waits for the drawer to open. */
export const addToCart = async (page: Page) => {
  await page.getByRole("button", { name: /^Add to cart – £[\d.]+$/ }).click();
  await expect(drawer(page)).toBeVisible();
};

/**
 * The product titles of the drawer's lines, top to bottom.
 *
 * Read from each line's "Remove … from cart" button, which only cart lines
 * have: other lists in the drawer (suggestions, SHO-116) stay out of it, and
 * no styling class is involved.
 */
export const lineTitles = async (page: Page) => {
  const buttons = await drawer(page)
    .getByRole("button", { name: /^Remove .+ from cart$/ })
    .all();
  // The name is the button's text: "Remove", then a screen-reader-only title.
  const names = await Promise.all(buttons.map((button) => button.textContent()));
  return names.map((name) =>
    (name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^Remove (.+) from cart$/, "$1"),
  );
};

/**
 * Starts the test as a shopper who has already declined tracking, so the
 * consent banner (fixed to the bottom of the screen) isn't covering anything.
 * Needed without JavaScript, where the banner's buttons can't dismiss it.
 */
export const decideConsent = async (
  context: BrowserContext,
  baseURL: string | undefined,
) => {
  if (!baseURL) return;
  await context.addCookies([
    { name: "formulate_tracking_consent", value: "denied", url: baseURL },
  ]);
};

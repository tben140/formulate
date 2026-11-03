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
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(drawer(page)).toBeVisible();
};

/**
 * The product titles of the drawer's lines, top to bottom.
 *
 * A line is a list item with its own Remove button. Matching on that rather
 * than on list position keeps other lists in the drawer (suggestions, SHO-116)
 * out of it.
 */
export const lineTitles = (page: Page) =>
  drawer(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /^Remove .+ from cart$/ }) })
    .locator("p.truncate")
    .allTextContents();

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

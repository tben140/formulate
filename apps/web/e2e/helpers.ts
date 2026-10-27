import { expect, type Page } from "@playwright/test";

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

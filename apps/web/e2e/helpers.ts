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

/** The product titles of the drawer's lines, top to bottom. */
export const lineTitles = (page: Page) =>
  drawer(page).locator("ul > li p.truncate").allTextContents();

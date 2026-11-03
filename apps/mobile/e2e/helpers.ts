import { expect, type Page } from "@playwright/test";

/** Opens a route and waits for the app, tab bar included, to be ready. */
export const openApp = async (page: Page, path = "/") => {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(tab(page, "Shop")).toBeVisible();
};

/** A tab in the bottom bar, by the start of its accessible name. */
export const tab = (page: Page, name: "Shop" | "Search" | "Account" | "Cart") =>
  page.getByRole("tab", { name: new RegExp(`^${name}`) });

/**
 * Taps a tab and waits until it's the selected one. Right after the first
 * render, React Navigation on web can still be settling its initial state and
 * drop a tap; this retries the tap instead of failing on a lost one.
 */
export const switchTab = async (page: Page, name: "Shop" | "Search" | "Account") => {
  await expect(async () => {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true", {
      timeout: 2_000,
    });
  }).toPass();
};

/** The current route, without the origin. */
export const route = (page: Page) => new URL(page.url()).pathname;

/** Product links in a list: their accessible names carry the price. */
export const productLinks = (page: Page) =>
  page.getByRole("link").filter({ hasText: /£/ });

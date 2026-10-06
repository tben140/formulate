import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { openApp, switchTab, tab } from "./helpers";

/**
 * WCAG 2.2 AA scans of the app's screens and sheets (SHO-92), through its web
 * build, the same rules as web's and the theme's suites.
 *
 * What this catches on native too: missing labels and states (a radio with no
 * checked state, an image with no description). What it can't: VoiceOver's
 * reading order and gestures, which need a device.
 *
 * `document-title` is off: it's about the browser tab of the web build, which
 * isn't shipped; the app has no document.
 */
const scan = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(["document-title"])
    .analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`),
  );
};

/** Waits for images to settle, so a mid-transition copy isn't what's scanned. */
const settle = (page: Page) => page.waitForLoadState("networkidle");

/**
 * Waits until an opened sheet is a dialog, not just visible.
 *
 * react-native-web (0.21.2) renders a Modal with `aria-modal` at once but adds
 * `role="dialog"` only when the modal becomes active, a tick later. A scan in
 * that gap reports `aria-allowed-attr` on the bare `aria-modal`: about one run
 * in eight, in CI and locally. It's an artefact of the web build; native doesn't
 * use ARIA. Waiting for the role is waiting for the state a user actually meets.
 */
const sheetOpen = (page: Page) => expect(page.getByRole("dialog")).toBeVisible();

test("home", async ({ page }) => {
  await openApp(page);
  await settle(page);
  expect(await scan(page)).toEqual([]);
});

test("a collection, and its filter sheet", async ({ page }) => {
  await openApp(page, "/collections/performance");
  await settle(page);
  expect(await scan(page)).toEqual([]);

  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("button", { name: "Show results" })).toBeVisible();
  await sheetOpen(page);
  expect(await scan(page)).toEqual([]);
});

test("a product, with option radios that report their state", async ({ page }) => {
  await openApp(page, "/products/whey-protein");
  await settle(page);
  await expect(page.getByRole("radio", { name: "Vanilla" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radio", { name: "Chocolate" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(await scan(page)).toEqual([]);
});

test("search results and the cart sheet", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Search");
  await page
    .getByRole("textbox", { name: "Search products" })
    .pressSequentially("omega", {
      delay: 50,
    });
  await expect(
    page.getByRole("link").filter({ hasText: "Omega-3 Fish Oil" }),
  ).toBeVisible();
  await settle(page);
  expect(await scan(page)).toEqual([]);

  await tab(page, "Cart").click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await sheetOpen(page);
  expect(await scan(page)).toEqual([]);
});

test("the Account tab", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Account");
  await expect(page.getByText("Accounts aren't available here")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

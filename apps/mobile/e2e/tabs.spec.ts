import { expect, test } from "@playwright/test";

import { openApp, productLinks, route, switchTab, tab } from "./helpers";

/**
 * The bottom tab bar (SHO-151): Shop · Search · Account · Cart. Shop and Search each
 * keep their own history; Cart opens the cart sheet rather than a screen.
 */

test("the tab bar offers Shop, Search, Account and Cart, starting on Shop", async ({
  page,
}) => {
  await openApp(page);
  await expect(tab(page, "Shop")).toBeVisible();
  await expect(tab(page, "Search")).toBeVisible();
  await expect(tab(page, "Account")).toBeVisible();
  // The cart's label says what its badge means.
  await expect(tab(page, "Cart")).toHaveAccessibleName("Cart, empty");
  await expect(tab(page, "Shop")).toHaveAttribute("aria-selected", "true");
  expect(route(page)).toBe("/");
});

test("the Search tab opens search, with results as you type", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Search");
  const box = page.getByRole("textbox", { name: "Search products" });
  await expect(box).toBeVisible();
  expect(route(page)).toBe("/search");

  await box.pressSequentially("omega", { delay: 50 });
  await expect(productLinks(page).filter({ hasText: "Omega-3 Fish Oil" })).toBeVisible();
  await expect(productLinks(page).filter({ hasText: "Omega-3 Algae Oil" })).toBeVisible();
});

test("each tab keeps its own history", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Search");
  await page
    .getByRole("textbox", { name: "Search products" })
    .pressSequentially("omega", {
      delay: 50,
    });
  await productLinks(page).filter({ hasText: "Omega-3 Fish Oil" }).click();
  await expect(page).toHaveURL(/\/products\/omega-3-fish-oil$/);

  // Away to Shop, which is still on home...
  await switchTab(page, "Shop");
  await expect(page).toHaveURL(/\/$/);

  // ...and back to Search, still on the product opened there.
  await switchTab(page, "Search");
  await expect(page).toHaveURL(/\/products\/omega-3-fish-oil$/);
});

test("tapping the tab you're on returns it to its first screen", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Search");
  await page
    .getByRole("textbox", { name: "Search products" })
    .pressSequentially("omega", {
      delay: 50,
    });
  await productLinks(page).filter({ hasText: "Omega-3 Fish Oil" }).click();
  await expect(page).toHaveURL(/\/products\/omega-3-fish-oil$/);

  await switchTab(page, "Search");
  await expect(page).toHaveURL(/\/search$/);
});

test("Cart opens the cart sheet without leaving the current tab", async ({ page }) => {
  await openApp(page);
  await switchTab(page, "Search");
  await expect(page).toHaveURL(/\/search$/);

  await tab(page, "Cart").click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page).toHaveURL(/\/search$/);

  await page.getByRole("button", { name: "Close cart" }).click();
  await expect(page.getByText("Your cart is empty.")).toBeHidden();
});

/*
 * Not covered here: the badge counting up after an add. The cart id lives in
 * the keychain (expo-secure-store), which has no web implementation, so Expo
 * web can't create a cart at all. That belongs to the device tests (SHO-26);
 * the badge's empty state and label are covered above.
 */

test("the Account tab explains that sign-in is in the native app", async ({ page }) => {
  // The web build has no keychain (expo-secure-store has no web version), so
  // the Account tab must say so, not offer a sign-in that can't keep a session.
  await openApp(page);
  await switchTab(page, "Account");
  await expect(page.getByText("Accounts aren't available here")).toBeVisible();
});

test("the subscriptions screen explains it isn't available in the web build", async ({
  page,
}) => {
  await openApp(page, "/account/subscriptions");
  await expect(
    page.getByText("Subscriptions can't be shown in this version of the app yet."),
  ).toBeVisible();
});

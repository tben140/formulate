import { expect, test } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * Header navigation, breadcrumbs and the footer's policy links (SHO-60). All
 * three come from Shopify menus ("Shop" and "Legal"), so these tests also
 * check the store's menus still say what the storefront expects.
 */

test("the header links to each collection in the Shop menu", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Best Sellers", "Daily Essentials", "Gut Health", "Performance"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }

  await nav.getByRole("link", { name: "Gut Health" }).click();
  await expect(page).toHaveURL(/\/collections\/gut-health$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gut Health" })).toBeVisible();
  // The current collection is marked for screen readers, not just by colour.
  await expect(nav.getByRole("link", { name: "Gut Health" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a product's breadcrumb goes through its first menu collection", async ({
  page,
}) => {
  await openProduct(page, "live-cultures");
  const trail = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(trail.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(trail.getByRole("link", { name: "Gut Health" })).toHaveAttribute(
    "href",
    "/collections/gut-health",
  );
  await expect(trail.getByText("Live Cultures")).toHaveAttribute("aria-current", "page");
});

test("the footer's policy links open the policy", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal" });
  await legal.getByRole("link", { name: /privacy policy/i }).click();
  await expect(page).toHaveURL(/\/policies\/privacy-policy$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /privacy policy/i }),
  ).toBeVisible();
});

test("an unknown policy is a 404", async ({ page }) => {
  const response = await page.goto("/policies/not-a-policy");
  expect(response?.status()).toBe(404);
});

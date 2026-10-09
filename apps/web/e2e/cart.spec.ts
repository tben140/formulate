import { expect, test } from "@playwright/test";

import { addToCart, cartButton, drawer, lineTitles, openProduct } from "./helpers";

test("add, change quantity and remove, with the header count in step", async ({
  page,
}) => {
  await openProduct(page, "daily-multivitamin");
  await expect(cartButton(page)).toHaveAccessibleName("Open cart, empty");

  await addToCart(page);
  expect(await lineTitles(page)).toEqual(["Daily Multivitamin"]);
  await expect(cartButton(page)).toHaveAccessibleName("Open cart, 1 item");

  const quantity = drawer(page).getByLabel("Quantity for Daily Multivitamin");
  await quantity.fill("3");
  await drawer(page).getByRole("button", { name: "Update" }).click();
  await expect(drawer(page).getByRole("heading", { level: 2 })).toContainText("3 items");
  await expect(cartButton(page)).toHaveAccessibleName("Open cart, 3 items");

  await drawer(page)
    .getByRole("button", { name: "Remove Daily Multivitamin from cart" })
    .click();
  await expect(drawer(page).getByText("Your cart is empty.")).toBeVisible();
  await expect(cartButton(page)).toHaveAccessibleName("Open cart, empty");
});

test("the cart survives a reload", async ({ page }) => {
  await openProduct(page, "vitamin-d3");
  await addToCart(page);
  await page.reload({ waitUntil: "networkidle" });
  await expect(cartButton(page)).toHaveAccessibleName("Open cart, 1 item");
});

test("the variant chosen is the variant added", async ({ page }) => {
  await openProduct(page, "whey-protein");
  await page.locator("label", { hasText: "Chocolate" }).click();
  await page.locator("label", { hasText: "Unsweetened" }).click();
  await addToCart(page);
  const line = drawer(page)
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: /^Remove Whey Protein from cart$/ }),
    });
  await expect(line).toContainText("Chocolate / Unsweetened");
});

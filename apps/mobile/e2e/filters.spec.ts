import { expect, test } from "@playwright/test";

import { openApp, productLinks } from "./helpers";

/**
 * The filter sheet (SHO-153) on a collection and in search. Uses Performance:
 * 6 products, 2 of them in Vanilla; and "protein", where Chocolate leaves
 * Whey and Plant Protein. Check those numbers first if the catalogue changed.
 */

test("filtering a collection narrows it, and the chip clears it", async ({ page }) => {
  await openApp(page, "/collections/performance");
  await expect(productLinks(page)).toHaveCount(6);

  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("checkbox", { name: /^Vanilla/ }).click();
  await page.getByRole("button", { name: "Show results" }).click();

  await expect(productLinks(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Filter, 1 active" })).toBeVisible();

  await page.getByRole("button", { name: "Flavour: Vanilla, remove filter" }).click();
  await expect(productLinks(page)).toHaveCount(6);
});

test("search results can be filtered too", async ({ page }) => {
  await openApp(page, "/search");
  await page
    .getByRole("textbox", { name: "Search products" })
    .pressSequentially("protein", {
      delay: 50,
    });
  await expect(productLinks(page).filter({ hasText: "Whey Protein" })).toBeVisible();

  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("checkbox", { name: /^Chocolate/ }).click();
  await page.getByRole("button", { name: "Show results" }).click();

  await expect(productLinks(page).filter({ hasText: "Whey Protein" })).toBeVisible();
  await expect(productLinks(page).filter({ hasText: "Plant Protein" })).toBeVisible();
  await expect(productLinks(page).filter({ hasText: "Creatine" })).toHaveCount(0);
});

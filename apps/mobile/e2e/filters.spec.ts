import { expect, test, type Page } from "@playwright/test";

import { openApp, productLinks } from "./helpers";

/**
 * The filter sheet (SHO-153) on a collection and in search. Uses Performance:
 * 6 products, 2 of them in Vanilla; and "protein", where Chocolate leaves
 * Whey and Plant Protein. Check those numbers first if the catalogue changed.
 */

/**
 * Ticks a value. Its group may start collapsed, and a long group shows five
 * values before a "Show N more" button. The header is tapped only while its
 * own group shows no values (a tap while the sheet is still sliding in can be
 * lost, so it's retried), and only that group's "Show N more" is used.
 */
const tick = async (page: Page, group: string, value: RegExp) => {
  const header = page.getByRole("button", { name: new RegExp(`^${group}`) });
  // The header's parent holds the group's values and its "Show N more".
  const section = header.locator("..");
  const box = section.getByRole("checkbox", { name: value });
  const more = section.getByRole("button", { name: /^Show \d+ more$/ });
  // Open means it shows values. (React Native Web doesn't render
  // accessibilityState.expanded as aria-expanded, so that can't be read.)
  const values = section.getByRole("checkbox");
  await expect(async () => {
    if ((await values.count()) === 0) await header.click();
    await expect(values.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  if (!(await box.isVisible()) && (await more.count()) > 0) await more.click();
  await box.click();
};

/** The sheet's apply button: "Show 2 products", or "Show results" in search. */
const showResults = (page: Page) =>
  page.getByRole("button", { name: /^Show (results|\d+\+? products?)$/ }).click();

test("filtering a collection narrows it, and the chip clears it", async ({ page }) => {
  await openApp(page, "/collections/performance");
  await expect(productLinks(page)).toHaveCount(6);

  // A collection sorts as well as filters, so its button says both.
  await page.getByRole("button", { name: "Filter & sort" }).click();
  await tick(page, "Flavour", /^Vanilla/);
  await showResults(page);

  await expect(productLinks(page)).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Filter & sort, 1 active" }),
  ).toBeVisible();

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
  await tick(page, "Flavour", /^Chocolate/);
  await showResults(page);

  await expect(productLinks(page).filter({ hasText: "Whey Protein" })).toBeVisible();
  await expect(productLinks(page).filter({ hasText: "Plant Protein" })).toBeVisible();
  await expect(productLinks(page).filter({ hasText: "Creatine" })).toHaveCount(0);
});

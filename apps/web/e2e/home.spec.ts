import { expect, test } from "@playwright/test";

/**
 * The home page (SHO-61). Its categories and featured collection come from the
 * Shopify menu "Shop": the categories are its collections, the featured one
 * its first.
 */
test("home introduces the shop, lists categories and features the first collection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shop Best Sellers" })).toHaveAttribute(
    "href",
    "/collections/best-sellers",
  );

  const categories = page.locator("section", {
    has: page.getByRole("heading", { name: "Shop by category" }),
  });
  await expect(categories.getByRole("link")).toHaveCount(6);

  const featured = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Best Sellers" }),
  });
  await expect(featured.getByRole("link", { name: /View all/ })).toHaveAttribute(
    "href",
    "/collections/best-sellers",
  );
  // The featured products are the links in the section's list.
  await expect(featured.getByRole("list").getByRole("link").first()).toBeVisible();
});

test("home states the offer and leads to the quiz", async ({ page }) => {
  await page.goto("/");
  const benefits = page.getByRole("list", { name: "Why Double Helix" });
  await expect(benefits.getByRole("listitem")).toHaveCount(4);
  await expect(benefits).toContainText("30-day money-back guarantee");
  // Once in the hero, once in its own section.
  await expect(page.getByRole("link", { name: "Take the quiz" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Take the quiz" }).first()).toHaveAttribute(
    "href",
    "/quiz",
  );
});

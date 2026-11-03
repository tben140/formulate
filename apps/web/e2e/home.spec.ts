import { expect, test } from "@playwright/test";

/**
 * The home page (SHO-61). Its categories and featured collection come from the
 * Shopify menu "Shop", which the header's Main navigation also shows: the
 * categories are its collections, in its order, and the featured one is its
 * first. So the test reads the menu from the header rather than naming
 * collections, and a merchant's menu change can't fail it.
 */
test("home introduces the shop, lists the menu's categories and features its first", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const menu = page
    .getByRole("navigation", { name: "Main" })
    .locator('a[href^="/collections/"]');
  const menuLinks = await menu.evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href") ?? "",
      title: (link.textContent ?? "").trim(),
    })),
  );
  const menuHrefs = [...new Set(menuLinks.map((link) => link.href))];
  expect(menuHrefs.length).toBeGreaterThan(0);
  const first = menuLinks[0]!;

  const categories = page.locator("section", {
    has: page.getByRole("heading", { name: "Shop by category" }),
  });
  const categoryHrefs = await categories
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  // Every card is a menu collection, in the menu's order.
  expect(categoryHrefs).toEqual(menuHrefs.filter((href) => categoryHrefs.includes(href)));
  expect(categoryHrefs.length).toBeGreaterThan(0);

  const featured = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: first.title }),
  });
  await expect(featured.getByRole("link", { name: /View all/ })).toHaveAttribute(
    "href",
    first.href,
  );
  // The featured products are the links in the section's list.
  await expect(featured.getByRole("list").getByRole("link").first()).toBeVisible();
});

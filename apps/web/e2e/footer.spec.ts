import { expect, test } from "@playwright/test";

/**
 * The footer is the same on every page (app/layout.tsx), so one page covers
 * it. The menu "Legal" is store content: this checks it renders links to
 * policy pages that load, not which policies the store has written.
 */
test("the footer links to the brand's socials, the store's policies and its payment methods", async ({
  page,
}) => {
  await page.goto("/collections/best-sellers");
  const footer = page.locator("footer");

  const social = footer
    .getByRole("navigation", { name: "Social media" })
    .getByRole("link");
  await expect(social).toHaveCount(6);
  for (const link of await social.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }

  const payments = footer.getByRole("list", { name: "Payment methods" }).getByRole("img");
  expect(await payments.count()).toBeGreaterThan(0);
  await expect(payments.first()).toHaveAccessibleName(/.+/);

  const legal = footer.getByRole("navigation", { name: "Legal" }).getByRole("link");
  expect(await legal.count()).toBeGreaterThan(0);
  await legal.first().click();
  await expect(page).toHaveURL(/\/policies\/[a-z-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

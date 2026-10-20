import { expect, test, type Page } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * "Email me when it's back" on sold-out variants (SHO-118).
 *
 * Klaviyo's endpoint is faked: a real request would leave a restock
 * subscription in Klaviyo on every CI run. What's checked is what this code
 * controls, the form and the request it sends; the request's shape was checked
 * live against Klaviyo when this was built (see packages/analytics).
 *
 * Relies on the demo store's stock plan (docs/demo-store.md): Lion's Mane is
 * sold out entirely, Magnesium Glycinate only in 200 mg.
 */

const field = (page: Page) =>
  page.getByRole("textbox", { name: "Email me when it's back" });

test("a sold-out product offers a restock alert, and sends it for that variant", async ({
  page,
}) => {
  const sent: unknown[] = [];
  await page.route(/client\/back-in-stock-subscriptions/, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, body: "" });
  });

  await openProduct(page, "lions-mane-mushroom");
  await expect(field(page)).toBeVisible();
  await expect(page.getByText(/This doesn't sign you up for marketing/)).toBeVisible();

  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();

  await field(page).fill("shopper@company.com");
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("We'll email you when it's back.")).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    data: {
      type: "back-in-stock-subscription",
      attributes: { channels: ["EMAIL"] },
      relationships: {
        variant: {
          data: {
            type: "catalog-variant",
            id: expect.stringMatching(/^\$shopify:::\$default:::\d+$/),
          },
        },
      },
    },
  });
});

test("the alert follows the selected variant", async ({ page }) => {
  await openProduct(page, "magnesium-glycinate");
  await expect(field(page)).toHaveCount(0);

  await page.getByRole("radio", { name: /200 mg/ }).check({ force: true });
  await expect(field(page)).toBeVisible();
  await expect(
    page.getByText(/One email when Magnesium Glycinate, 200 mg is back/),
  ).toBeVisible();
});

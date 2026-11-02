import { expect, test, type Locator } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * The Black Friday campaign as shoppers will see it on the day (SHO-169),
 * against the real campaign record in Shopify.
 *
 * The server decides what's live from its clock, so these run only with a
 * preview time inside the campaign's last day, given to the server this suite
 * starts (`pnpm test:e2e:campaign` sets it). Against a deployment
 * (E2E_BASE_URL) the server's clock is its own, so they skip.
 *
 * Expected prices come from the page's own "normally" price and the
 * campaign's 25%, so a repriced product doesn't break them; the offer itself
 * is read from the record (offer_rules), checked here by its effect.
 */
const PREVIEW_AT = "2026-11-30T20:00:00Z";
const PERCENT = 25;

test.skip(
  process.env.CAMPAIGN_PREVIEW_AT !== PREVIEW_AT || Boolean(process.env.E2E_BASE_URL),
  `needs CAMPAIGN_PREVIEW_AT=${PREVIEW_AT} on a server this suite starts (pnpm test:e2e:campaign)`,
);

/** The campaign price of `normal`, to the penny, as packages/shopify rounds it. */
const offerOf = (normal: number) => Math.round(normal * (100 - PERCENT)) / 100;

/** A "Normally £x, Black Friday price £y" pair in `text`, y being x less 25%. */
const expectOfferPriceIn = (text: string) => {
  const match = text.match(
    /Normally\s*£(\d+\.\d\d)\s*,\s*Black Friday price\s*£(\d+\.\d\d)/,
  );
  expect(match, `an offer price in: ${text.slice(0, 200)}`).not.toBeNull();
  const [, normal, offer] = match!;
  expect(Number(offer)).toBe(offerOf(Number(normal)));
};

const expectOfferPrice = async (scope: Locator) =>
  expectOfferPriceIn((await scope.textContent()) ?? "");

test("the banner names the offer and counts down in its last day", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  const banner = page.getByRole("link", {
    name: /^Black Friday: 25% off one-time orders/,
  });
  await expect(banner).toBeVisible();
  // 20:00 on 30 Nov, ending at midnight UK time (00:00Z on 1 Dec).
  await expect(page.getByText("Ends in 4h 0m").first()).toBeVisible();
});

test("a product shows the campaign price for one-time, not for subscriptions", async ({
  page,
}) => {
  await openProduct(page, "vitamin-d3");
  const options = page.getByRole("group", { name: "Purchase options" });
  // Each option's accessible name carries its price, as a screen reader hears it.
  const names = await options
    .getByRole("radio")
    .evaluateAll((radios) =>
      radios.map(
        (radio) => radio.closest("label")?.textContent?.replace(/\s+/g, " ") ?? "",
      ),
    );
  const oneTime = names.filter((name) => /one-time/i.test(name));
  const subscriptions = names.filter((name) => /subscription/i.test(name));
  expect(oneTime).toHaveLength(1);
  expectOfferPriceIn(oneTime[0]!);
  // Subscriptions keep their own price: no campaign price beside them.
  expect(subscriptions.length).toBeGreaterThan(0);
  for (const name of subscriptions) expect(name).not.toContain("Black Friday price");
});

test("the campaign page lists its products at the campaign price", async ({ page }) => {
  await page.goto("/pages/campaigns/black-friday-2026");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Black Friday: 25% off one-time orders/,
  );
  const cards = page.locator('main li:has(a[href^="/products/"])');
  await expect(cards.first()).toBeVisible();
  for (const card of (await cards.all()).slice(0, 4)) await expectOfferPrice(card);
});

test("the home page leads with the campaign", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Black Friday: 25% off one-time orders/,
  );
  await expect(
    page.getByRole("link", { name: "Shop the Black Friday offer" }),
  ).toHaveAttribute("href", "/pages/campaigns/black-friday-2026");
});

test("a collection lists the campaign's products first", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  const cards = page.locator('main li:has(a[href^="/products/"])');
  await expect(cards.first()).toBeVisible();
  const inCampaign = await cards.evaluateAll((items) =>
    items.map((item) => (item.textContent ?? "").includes("Black Friday price")),
  );
  // Every campaign card before the first one that isn't.
  const firstOther = inCampaign.indexOf(false);
  expect(inCampaign[0]).toBe(true);
  if (firstOther !== -1) expect(inCampaign.slice(firstOther)).not.toContain(true);
});

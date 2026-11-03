import { expect, test, type Page } from "@playwright/test";

import { openProduct } from "./helpers";

/**
 * What the Black Friday campaign looks like in each of its states (SHO-169),
 * as screenshots of the parts it changes: the banner, the home hero, the
 * product page's campaign box and the campaign page's header. A layout that
 * breaks in one state (the last day's countdown, say) shows as a diff.
 *
 * The state comes from the server's clock, so each run takes one preview
 * time: `pnpm test:e2e:campaign-states` runs all four in turn. Against a
 * deployment, or without a preview time, it skips. Element screenshots only,
 * with product imagery left out, so store content changes don't churn them.
 */
const STATES: Record<string, string> = {
  "2026-11-20T12:00:00Z": "upcoming",
  "2026-11-28T12:00:00Z": "live",
  "2026-11-30T20:00:00Z": "last-day",
  "2026-12-02T12:00:00Z": "ended",
};
const previewAt = process.env.CAMPAIGN_PREVIEW_AT ?? "";
const state = STATES[previewAt];

test.skip(
  !state || Boolean(process.env.E2E_BASE_URL),
  "needs CAMPAIGN_PREVIEW_AT set to one of the four state times (pnpm test:e2e:campaign-states)",
);

const shot = async (page: Page, selector: string, name: string) => {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) {
    // Absent is a state too (no banner once it's ended): record that instead.
    expect(name).toMatchSnapshot(`${state}-${name}.absent.txt`);
    return;
  }
  await expect(target).toHaveScreenshot(`${state}-${name}.png`, {
    animations: "disabled",
    mask: [target.locator("img")],
  });
};

test.use({ viewport: { width: 1280, height: 900 } });

test("the banner and the home hero", async ({ page }) => {
  await page.goto("/");
  await shot(page, "div:has(> p > a[href^='/pages/campaigns/'])", "banner");
  await shot(page, "section[aria-labelledby='home-intro']", "home-hero");
});

test("the product page's campaign box", async ({ page }) => {
  await openProduct(page, "vitamin-d3");
  await shot(page, "aside[aria-label='Black Friday 2026']", "product-box");
});

test("the campaign page's header", async ({ page }) => {
  await page.goto("/pages/campaigns/black-friday-2026");
  await shot(page, "main article > header", "campaign-header");
});

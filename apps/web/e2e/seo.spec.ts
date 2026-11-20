import { expect, type Page, test } from "@playwright/test";

/**
 * What search engines and link previews read: titles, canonicals, the share
 * image and structured data. The same at every width, so desktop only.
 */
test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop only");

const structuredTypes = async (page: Page): Promise<string[]> => {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.flatMap((block) => {
    const data = JSON.parse(block) as { "@type": string } | { "@type": string }[];
    return (Array.isArray(data) ? data : [data]).map((item) => item["@type"]);
  });
};

test("home: brand title, canonical, share image, and the shop's structured data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Double Helix");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\/[^/]+\/?$/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/og$/,
  );
  expect(await structuredTypes(page)).toEqual(
    expect.arrayContaining(["Organization", "WebSite"]),
  );
});

test("the share image is a 1200 × 630 PNG", async ({ request }) => {
  const response = await request.get("/og");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("a policy page is titled after its policy, with a canonical", async ({ page }) => {
  await page.goto("/policies/privacy-policy");
  await expect(page).toHaveTitle("Privacy Policy — Double Helix");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/policies\/privacy-policy$/,
  );
});

test("no page title repeats the brand", async ({ page }) => {
  for (const path of [
    "/",
    "/collections/best-sellers",
    "/search?q=vitamin",
    "/policies/refund-policy",
  ]) {
    await page.goto(path);
    expect(await page.title(), path).not.toMatch(/Double Helix.*Double Helix/);
  }
});

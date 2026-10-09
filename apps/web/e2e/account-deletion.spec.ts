import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Account deletion (SHO-90), the parts that run without a real sign-in. The
 * signed-in confirmation and the Worker calls are covered by apps/api's tests
 * and a local run against a stand-in Worker (see the PR).
 */

test("the help page is public, and says what deletion does", async ({ page }) => {
  await page.goto("/account/delete-help");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to delete your account");
  await expect(page.getByText(/six months/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Delete your account" })).toHaveAttribute(
    "href",
    "/account/delete",
  );

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test("signed out, /account/delete sends the buyer to sign in and back", async ({ request }) => {
  const response = await request.get("/account/delete", { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location).toContain(
    `/account/login?return_to=${encodeURIComponent("/account/delete")}`,
  );
});

test.describe("the confirm route", () => {
  test("refuses a form posted from another site", async ({ request }) => {
    const response = await request.post("/account/delete/confirm", {
      form: { understood: "on" },
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });

  test("deletes nothing without the checkbox", async ({ request }) => {
    const response = await request.post("/account/delete/confirm", {
      form: {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toMatch(/\/account\/delete\?error=not-confirmed$/);
  });

  test("signed out, sends the buyer to sign in", async ({ request }) => {
    const response = await request.post("/account/delete/confirm", {
      form: { understood: "on" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toMatch(/\/account\/login$/);
  });
});

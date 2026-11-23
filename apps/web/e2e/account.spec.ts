import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Customer accounts, signed out (SHO-70).
 *
 * Signing in itself can't run here: it happens on shopify.com, with a one-time
 * code sent by email. What can be pinned is everything on our side of that:
 * the guard, the PKCE request we hand Shopify, and what a failed sign-in
 * looks like.
 *
 * A deployment without the Customer Account env vars says so on /account
 * instead, and these tests check that rather than failing.
 */

test("the header links to the account page", async ({ page }) => {
  await page.goto("/collections/best-sellers");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Account" }),
  ).toHaveAttribute("href", "/account");
});

test("signed out, /account sends the buyer to Shopify's sign-in with PKCE", async ({
  request,
  baseURL,
}) => {
  const account = await request.get("/account", { maxRedirects: 0 });

  if (account.status() === 200) {
    // Unconfigured deployment: it must explain, not loop.
    expect(await account.text()).toContain("Accounts aren");
    return;
  }

  expect(account.status()).toBe(307);
  expect(account.headers().location).toContain("/account/login?return_to=%2Faccount");

  const login = await request.get("/account/login?return_to=%2Faccount", {
    maxRedirects: 0,
  });
  expect(login.status()).toBe(307);

  const shopify = new URL(login.headers().location ?? "");
  expect(shopify.origin).toBe("https://shopify.com");
  expect(shopify.pathname).toMatch(/^\/authentication\/\d+\/oauth\/authorize$/);

  const params = shopify.searchParams;
  expect(params.get("response_type")).toBe("code");
  expect(params.get("code_challenge_method")).toBe("S256");
  expect(params.get("code_challenge")).toMatch(/^[\w-]{43}$/);
  expect(params.get("redirect_uri")).toBe(
    new URL("/account/authorize", baseURL).toString(),
  );

  // The pending sign-in is server-side state: httpOnly, never readable by script.
  expect(login.headers()["set-cookie"]).toMatch(/formulate_customer_auth=.*HttpOnly/i);
});

test("a callback that isn't ours is refused", async ({ request }) => {
  const callback = await request.get("/account/authorize?code=stolen&state=forged", {
    maxRedirects: 0,
  });
  expect(callback.status()).toBe(307);
  expect(callback.headers().location).toContain("/account?error=sign-in");
});

test("return_to can't send a buyer off-site", async ({ request }) => {
  const login = await request.get("/account/login?return_to=%2F%2Fevil.example", {
    maxRedirects: 0,
  });
  // Unconfigured deployments don't start a sign-in at all.
  test.skip(login.headers().location?.endsWith("/account") ?? false, "not configured");

  const cookie = /formulate_customer_auth=([^;]+)/.exec(
    login.headers()["set-cookie"] ?? "",
  );
  const pending = JSON.parse(decodeURIComponent(cookie?.[1] ?? "{}")) as {
    returnTo?: string;
  };
  expect(pending.returnTo).toBe("/account");
});

test("a failed sign-in explains itself, accessibly", async ({ page }) => {
  await page.goto("/account?error=sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

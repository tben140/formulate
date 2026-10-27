import { expect, test, type Page } from "@playwright/test";

import { addToCart, openProduct } from "./helpers";

/**
 * The security headers (lib/security-headers.ts) are sent, and the Content
 * Security Policy, though only report-only, would block nothing the main pages
 * load. A violation here means a new host belongs in the policy, or something
 * is loading that shouldn't.
 */

test("every page is sent the security headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

/** Records every CSP violation on this page, from its first script on. */
const recordViolations = async (page: Page) => {
  const violations: string[] = [];
  await page.exposeFunction("reportCspViolation", (violation: string) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (
        window as unknown as { reportCspViolation: (v: string) => void }
      ).reportCspViolation(
        `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} on ${location.pathname}`,
      );
    });
  });
  return violations;
};

const visitMainPages = async (page: Page) => {
  for (const path of ["/", "/collections/best-sellers", "/search?q=vitamin"]) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await openProduct(page, "whey-protein");
  await addToCart(page);
};

test("the main pages break no part of the Content Security Policy", async ({ page }) => {
  const violations = await recordViolations(page);
  await visitMainPages(page);
  expect(violations).toEqual([]);
});

test("nor do they once tracking is accepted and Klaviyo loads", async ({ page }) => {
  const violations = await recordViolations(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const accept = page.getByRole("button", { name: "Accept", exact: true });
  // Without a Klaviyo key there's no consent banner and nothing to load.
  test.skip((await accept.count()) === 0, "Klaviyo isn't configured on this deployment");
  const klaviyo = page.waitForResponse((response) =>
    response.url().startsWith("https://static.klaviyo.com/onsite/js/"),
  );
  await accept.click();
  await klaviyo;
  await visitMainPages(page);
  expect(violations).toEqual([]);
});

import { chromium } from "@playwright/test";

/** Where the bypass cookie is saved for the tests to reuse. Gitignored. */
export const VERCEL_AUTH_STATE = "e2e/.auth/vercel.json";

/**
 * Gets past Vercel Deployment Protection once, before any test runs (SHO-140).
 *
 * Only does anything when E2E_BASE_URL points at a deployment and
 * VERCEL_AUTOMATION_BYPASS_SECRET is set, which is how CI runs against each
 * preview. Locally against :3200 it returns straight away.
 *
 * The secret goes on the query string of a single visit, with
 * `x-vercel-set-bypass-cookie`, so Vercel answers with a cookie for the preview
 * domain. That cookie is saved as storage state and every test starts from it.
 * Not `extraHTTPHeaders`: Playwright sends those with every request, including
 * to Shopify's CDN and Klaviyo, which would hand the secret to third parties.
 */
const globalSetup = async () => {
  const baseURL = process.env.E2E_BASE_URL;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!baseURL || !secret) return;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const url = new URL("/collections/best-sellers", baseURL);
    url.searchParams.set("x-vercel-protection-bypass", secret);
    url.searchParams.set("x-vercel-set-bypass-cookie", "true");
    /*
     * ⚠️ Never let this navigation's own error escape. Playwright's message
     * includes the full URL, secret and all, and the HTML report stores setup
     * errors base64-encoded where the workflow's redaction can't see them. So a
     * timeout or network error is rethrown with only the error's kind.
     */
    let response;
    try {
      response = await page.goto(url.toString());
    } catch (error) {
      const kind = error instanceof Error ? error.name : "unknown error";
      // No `cause`: attaching the original error is exactly what leaks the URL.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        `Vercel bypass failed: navigation to ${url.origin} threw (${kind}). ` +
          "The preview may still be starting, or be unreachable. Details omitted: the URL carries the bypass secret.",
      );
    }

    // Fail here, once and clearly, rather than in every test with a login page.
    if (!response?.ok() || new URL(page.url()).hostname.endsWith("vercel.com")) {
      throw new Error(
        `Vercel bypass failed: ${response?.status() ?? "no response"} at ${new URL(page.url()).origin}. ` +
          "Check VERCEL_AUTOMATION_BYPASS_SECRET matches the project's Protection Bypass for Automation secret.",
      );
    }

    await context.storageState({ path: VERCEL_AUTH_STATE });
  } finally {
    await browser.close();
  }
};

export default globalSetup;

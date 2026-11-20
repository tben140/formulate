/**
 * Lighthouse CI for the Liquid theme (SHO-174), the same shape as web's
 * apps/web/lighthouserc.cjs: three pages, three runs each, a budget on each
 * metric's median.
 *
 * Run by .github/workflows/lighthouse-theme.yml against a temporary
 * unpublished theme. Locally, against any theme on the store:
 *
 *   SHOP_STORE=<store>.myshopify.com SHOP_PASSWORD=… THEME_ID=<id> \
 *     npx -p @lhci/cli@0.15.1 -p puppeteer@25.12.0 lhci collect --config=apps/theme/lighthouserc.cjs
 *
 * Replaces Shopify's lighthouse-ci-action, which took minimum scores only,
 * judged one "median run" (so one noisy run could fail a PR), timed out on the
 * password step now and then, and uploaded reports to public storage.
 */

const store = (process.env.SHOP_STORE || "").replace(/^https?:\/\//, "");

// Plain URLs: scripts/lighthouse-login.cjs sets the preview cookie for the
// theme under test (THEME_ID) first, and checks it took.
const page = (path) => `https://${store}${path}`;

// The same three pages web audits (apps/web/lighthouserc.cjs), so the two
// surfaces are compared like for like. The collection is
// DEFAULT_COLLECTION_HANDLE (packages/shopify/src/config.ts).
const PATHS = ["/", "/collections/best-sellers", "/products/magnesium-glycinate"];

/** Each metric's median across the runs; see web's config for why not `median-run`. */
const median = { aggregationMethod: "median" };

module.exports = {
  ci: {
    collect: {
      url: PATHS.map(page),
      numberOfRuns: 3,
      // Signs in through the storefront password and sets the preview cookie.
      puppeteerScript: "./apps/theme/scripts/lighthouse-login.cjs",
      puppeteerLaunchOptions: {
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        // CI and the droplet point this at an installed Chrome; puppeteer's
        // own download is skipped.
        executablePath: process.env.CHROME_PATH,
      },
    },
    assert: {
      assertions: {
        // From the first two CI runs (2026-10-28, #178), per-page medians:
        // performance 0.83-0.98, LCP 2.0-3.3 s, CLS 0-0.025, TBT 68-326 ms.
        // GitHub's runners vary about 3x on TBT between runs, so the budgets
        // leave room for a slow runner: web's values where web has them
        // (TBT 600 ms, CLS 0.05, LCP 4 s), performance a little below web's.
        // Ratchet with more runs, as web's were (SHO-68).
        "categories:performance": ["error", { minScore: 0.75, ...median }],
        "categories:accessibility": ["error", { minScore: 0.95, ...median }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000, ...median }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.05, ...median }],
        "total-blocking-time": ["error", { maxNumericValue: 600, ...median }],
      },
    },
    upload: {
      // On the runner, uploaded as a workflow artifact. Never public storage.
      target: "filesystem",
      outputDir: ".lighthouseci/reports",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};

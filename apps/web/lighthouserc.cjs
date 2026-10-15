/**
 * Lighthouse CI for the web storefront (SHO-23).
 *
 * Run by .github/workflows/lighthouse-web.yml against every Vercel deployment,
 * and weekly against production. Runnable locally against any build:
 *
 *   LHCI_BASE_URL=http://localhost:3000 npx @lhci/cli@0.15.1 collect --config=apps/web/lighthouserc.cjs
 *
 * Budgets are deliberately generous. The point for now is that the gate exists
 * and catches a regression; the values ratchet at phase exit (SHO-68). The
 * baseline they were set against is recorded in docs/surface-web.md.
 */

const base = (process.env.LHCI_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Vercel previews sit behind Deployment Protection. The bypass secret goes on
// the query string, not in `extraHeaders`: Lighthouse sends extra headers with
// every request, including to Shopify's CDN and Klaviyo, which would hand the
// secret to third parties. `x-vercel-set-bypass-cookie` makes Vercel set a
// cookie on the document response, so the page's own chunks load too. The
// workflow redacts the secret from the saved reports before uploading them.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const withBypass = (path) =>
  bypass
    ? `${base}${path}?x-vercel-protection-bypass=${encodeURIComponent(bypass)}&x-vercel-set-bypass-cookie=true`
    : `${base}${path}`;

// One listing and one product page: the two templates every shopper sees, and
// the same pair the theme's Lighthouse run audits. `/` is left out because it
// is a redirect to a collection, so it would audit the redirect, not a page.
const PATHS = ["/collections/best-sellers", "/products/magnesium-glycinate"];

/** Median of three runs, so one noisy run can neither pass nor fail a PR. */
const median = { aggregationMethod: "median-run" };

module.exports = {
  ci: {
    collect: {
      url: PATHS.map(withBypass),
      numberOfRuns: 3,
      // Lighthouse's default mobile profile: a mid-range phone on a throttled
      // connection. Core Web Vitals are judged on mobile, so that is the gate.
    },
    assert: {
      assertions: {
        // Ratcheted to just under recent CI actuals (SHO-68, 2026-10-07): single
        // runs ranged perf 0.82-0.99, LCP up to 3.6 s, TBT up to 650 ms, CLS
        // 0.003, and these are medians of three. The old floors (0.5, 6 s,
        // 1.2 s) passed a deliberate 2 s regression (SHO-29).
        //
        // ⚠️ Simulated Lighthouse can't see server time behind a streamed
        // response: a 2 s server wait still scored 0.93. e2e/performance.spec.ts
        // times what actually arrives, and is the gate for that.
        "categories:performance": ["error", { minScore: 0.8, ...median }],
        "categories:accessibility": ["error", { minScore: 0.95, ...median }],
        // Core Web Vitals. Lab data has no INP, so Total Blocking Time stands in
        // for it; field INP comes from Vercel Speed Insights.
        "largest-contentful-paint": ["error", { maxNumericValue: 4000, ...median }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.05, ...median }],
        "total-blocking-time": ["error", { maxNumericValue: 600, ...median }],
      },
    },
    upload: {
      // Reports stay on the runner and are uploaded as a workflow artifact.
      // Not `temporary-public-storage`: a preview report would publish the
      // preview URL to a public bucket.
      target: "filesystem",
      outputDir: ".lighthouseci/reports",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};

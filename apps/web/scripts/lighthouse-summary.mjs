/**
 * Turns a Lighthouse CI filesystem upload into a Markdown table.
 *
 * Usage: node apps/web/scripts/lighthouse-summary.mjs .lighthouseci/reports
 *
 * Prints to stdout; the workflow appends it to $GITHUB_STEP_SUMMARY, which is
 * what shows on the PR's check page. Only the representative (median) run for
 * each URL is reported, matching what the assertions judge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? ".lighthouseci/reports";
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

const score = (n) => (n == null ? "–" : Math.round(n * 100));
const ms = (audit) => `${(audit.numericValue / 1000).toFixed(1)} s`;

const rows = manifest
  .filter((entry) => entry.isRepresentativeRun)
  .map((entry) => {
    const lhr = JSON.parse(readFileSync(entry.jsonPath, "utf8"));
    const a = lhr.audits;
    // The path only: the query string can carry the preview bypass secret.
    const path = new URL(entry.url).pathname;
    return [
      path,
      score(entry.summary.performance),
      score(entry.summary.accessibility),
      ms(a["largest-contentful-paint"]),
      a["cumulative-layout-shift"].numericValue.toFixed(3),
      `${Math.round(a["total-blocking-time"].numericValue)} ms`,
    ];
  });

const lines = [
  "### Lighthouse (mobile, median of 3)",
  "",
  "| Page | Performance | Accessibility | LCP | CLS | TBT |",
  "| --- | --: | --: | --: | --: | --: |",
  ...rows.map((r) => `| \`${r[0]}\` | ${r.slice(1).join(" | ")} |`),
  "",
  "Budgets: performance ≥ 50, accessibility ≥ 95, LCP ≤ 6.0 s, CLS ≤ 0.1, TBT ≤ 1200 ms. Full reports are in the `lighthouse-web` artifact.",
];

console.log(lines.join("\n"));

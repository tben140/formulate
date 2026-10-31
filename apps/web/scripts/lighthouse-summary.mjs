/**
 * Turns a Lighthouse CI filesystem upload into a Markdown table.
 *
 * Usage: node apps/web/scripts/lighthouse-summary.mjs .lighthouseci/reports
 *
 * Prints to stdout; the workflow appends it to $GITHUB_STEP_SUMMARY, which is
 * what shows on the PR's check page. The table shows Lighthouse's
 * representative run for each URL; the assertions judge the median of each
 * metric across the three runs, so the two can differ slightly.
 *
 * The budgets line is read from lighthouserc.cjs, so it can't drift from what
 * the gate enforces.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { assertions } = createRequire(import.meta.url)("../lighthouserc.cjs").ci.assert;
const limit = (key, field) => assertions[key]?.[1]?.[field];
const budgets = [
  `performance ≥ ${Math.round(limit("categories:performance", "minScore") * 100)}`,
  `accessibility ≥ ${Math.round(limit("categories:accessibility", "minScore") * 100)}`,
  `LCP ≤ ${(limit("largest-contentful-paint", "maxNumericValue") / 1000).toFixed(1)} s`,
  `CLS ≤ ${limit("cumulative-layout-shift", "maxNumericValue")}`,
  `TBT ≤ ${limit("total-blocking-time", "maxNumericValue")} ms`,
].join(", ");

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
  `Budgets (median of 3): ${budgets}. Full reports are in the \`lighthouse-web\` artifact.`,
];

console.log(lines.join("\n"));

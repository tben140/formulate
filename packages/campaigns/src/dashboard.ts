import { formatMoney } from "@formulate/shopify";

import type { CampaignReport } from "./report";

/**
 * The campaign's results as one self-contained HTML page (SHO-169): what
 * `campaigns report --html` writes, and `--watch` rewrites every few minutes
 * through the campaign, for Ben to keep open or publish privately. No
 * scripts, no outside requests; every value from the store is escaped.
 */
const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const reportHtml = (
  title: string,
  report: CampaignReport,
  generatedAt: Date,
): string => {
  const money = (amount: number) =>
    escape(formatMoney({ amount: amount.toFixed(2), currencyCode: report.currencyCode }));
  const rows = (counts: Readonly<Record<string, number>>) =>
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(
        ([key, count]) => `<tr><td>${escape(key)}</td><td class="n">${count}</td></tr>`,
      )
      .join("") || `<tr><td colspan="2" class="none">None yet</td></tr>`;
  const peak = Math.max(1, ...report.byHour.map((h) => h.orders));
  const bars = report.byHour
    .map(
      (h) =>
        `<li title="${escape(h.hour)}:00, ${h.orders} orders"><span style="block-size:${Math.round((h.orders / peak) * 100)}%"></span></li>`,
    )
    .join("");
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);
  const stat = (label: string, value: string) =>
    `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} results</title>
<style>
:root { --bg: #f8fafc; --panel: #ffffff; --fg: #0f172a; --muted: #475569; --line: #e2e8f0; --accent: #1d49d8; color-scheme: light }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1220; --panel: #111a2e; --fg: #e2e8f0; --muted: #a3b1c6; --line: #22304a; --accent: #7aa2ff; color-scheme: dark } }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px max(16px, env(safe-area-inset-left)) 48px }
main { max-width: 960px; margin: 0 auto; display: grid; gap: 24px }
h1 { margin: 0; font-size: 1.6rem; text-wrap: balance }
p.when { margin: 4px 0 0; color: var(--muted) }
dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px }
dt { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em }
dd { margin: 4px 0 0; font-size: clamp(1.15rem, 2.4vw, 1.5rem); overflow-wrap: anywhere; font-weight: 600; font-variant-numeric: tabular-nums }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0 }
h2 { margin: 0 0 10px; font-size: 1rem }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px }
table { width: 100%; border-collapse: collapse }
td { padding: 6px 0; border-top: 1px solid var(--line) }
td.n { text-align: right; font-variant-numeric: tabular-nums }
td.none { color: var(--muted) }
ol.hours { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 2px; block-size: 120px; overflow-x: auto }
ol.hours li { flex: 1 0 6px; block-size: 100%; display: flex; align-items: flex-end }
p.axis { display: flex; justify-content: space-between; margin: 6px 0 0; color: var(--muted); font-size: .8rem }
ol.hours span { display: block; inline-size: 100%; background: var(--accent); border-radius: 2px 2px 0 0; min-block-size: 2px }
</style>
</head>
<body>
<main>
<header>
<h1>${escape(title)}: results</h1>
<p class="when">As of ${escape(when)} (UK time). Orders where the campaign's discount applied or the cart came from its page.</p>
</header>
<dl>
${stat("Orders", String(report.orders))}
${stat("Revenue", money(report.revenue))}
${stat("Discount given", money(report.discountCost))}
${stat("Average order", report.orders ? money(report.revenue / report.orders) : "—")}
${stat("First orders", String(report.firstOrders))}
${stat("Subscriptions started", String(report.subscriptionsStarted))}
</dl>
<section aria-labelledby="hours"><h2 id="hours">Orders by hour</h2>${
    bars
      ? `<ol class="hours">${bars}</ol><p class="axis"><span>${escape(report.byHour[0]!.hour)}:00</span><span>${escape(report.byHour.at(-1)!.hour)}:00</span></p>`
      : `<p class="when">None yet</p>`
  }</section>
<div class="grid">
<section aria-labelledby="surface"><h2 id="surface">By surface</h2><table>${rows(report.bySurface)}</table></section>
<section aria-labelledby="source"><h2 id="source">By source</h2><table>${rows(report.bySource)}</table></section>
<section aria-labelledby="top"><h2 id="top">Top products</h2><table>${
    report.topProducts
      .map((p) => `<tr><td>${escape(p.title)}</td><td class="n">${p.quantity}</td></tr>`)
      .join("") || `<tr><td colspan="2" class="none">None yet</td></tr>`
  }</table></section>
</div>
</main>
</body>
</html>
`;
};

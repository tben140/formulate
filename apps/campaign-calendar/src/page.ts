/**
 * The embedded page (SHO-205). App Bridge loads first, as Shopify requires;
 * it puts the page in the admin and adds the session token to this page's
 * own `fetch` calls, which is how /api knows who's asking. Store data is only
 * ever written with `textContent`, never as HTML.
 */
export const page = (clientId: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="shopify-api-key" content="${clientId}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>Campaign calendar</title>
<style>
  :root { color-scheme: light; --ink: #1e293b; --muted: #475569; --line: #e2e8f0; --bg: #f8fafc;
    --live: #15803d; --upcoming: #1d49d8; --ended: #64748b; --draft: #b45309; --invalid: #dc2626; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--bg); }
  h1 { font-size: 20px; margin: 0 0 12px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  section { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .notes li { color: var(--draft); }
  .months { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .month table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .month th { font-size: 11px; color: var(--muted); font-weight: 600; padding: 2px; }
  .month td { vertical-align: top; height: 58px; border: 1px solid var(--line); padding: 2px; font-size: 11px; }
  .month td.today { outline: 2px solid var(--upcoming); outline-offset: -2px; }
  .day { color: var(--muted); }
  .bar { display: block; margin-top: 2px; padding: 0 3px; border-radius: 3px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .retail { display: block; color: var(--muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state-live { background: var(--live); } .state-upcoming { background: var(--upcoming); }
  .state-ended { background: var(--ended); } .state-draft { background: var(--draft); } .state-invalid { background: var(--invalid); }
  table.list { width: 100%; border-collapse: collapse; }
  table.list th, table.list td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .pill { display: inline-block; padding: 0 8px; border-radius: 99px; color: #fff; font-size: 12px; }
  button, a.button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); cursor: pointer; text-decoration: none; display: inline-block; margin: 2px 4px 2px 0; }
  button.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
  .finding-error { color: var(--invalid); } .finding-warning { color: var(--draft); } .finding-ok { color: var(--live); }
  .findings { list-style: none; padding: 0; margin: 0 0 12px; }
  .findings li { padding: 3px 0; }
  .muted { color: var(--muted); }
  code { font-size: 12px; word-break: break-all; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<h1>Campaign calendar</h1>
<p class="muted" id="status">Loading campaigns…</p>
<section id="notes-section" hidden><h2>Needs attention</h2><ul class="notes" id="notes"></ul></section>
<section><h2>Calendar</h2><div class="months" id="months"></div>
  <p class="muted">Bars are campaigns, by state: <span class="pill state-live">live</span> <span class="pill state-upcoming">upcoming</span> <span class="pill state-draft">draft</span> <span class="pill state-ended">ended</span>. Italics are UK retail days.</p></section>
<section><h2>Campaigns</h2><table class="list"><thead><tr><th>Campaign</th><th>State</th><th>Runs (UK)</th><th></th></tr></thead><tbody id="rows"></tbody></table></section>
<section id="detail" hidden aria-live="polite"><h2 id="detail-title"></h2><div id="detail-body"></div></section>
<script type="module">
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child ?? "");
  return node;
};
const ukDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
const ukTime = (iso) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

const api = async (path, init) => {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
};

const renderMonths = (data) => {
  const months = document.getElementById("months");
  months.replaceChildren();
  const today = ukDay(data.now);
  const start = new Date(data.now);
  for (let m = 0; m < 3; m++) {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const year = first.getUTCFullYear(), month = first.getUTCMonth();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const body = el("tbody");
    let row = el("tr");
    for (let i = 0; i < offset; i++) row.append(el("td"));
    for (let d = 1; d <= days; d++) {
      const date = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const cell = el("td", date === today ? { class: "today" } : {}, el("span", { class: "day" }, String(d)));
      for (const r of data.retail.filter((x) => x.date === date)) cell.append(el("span", { class: "retail", title: r.name }, r.name));
      for (const c of data.rows) {
        if (!c.startsAt || !c.endsAt) continue;
        // A campaign ending at midnight doesn't run on that day.
        const last = ukDay(new Date(new Date(c.endsAt).getTime() - 1).toISOString());
        if (ukDay(c.startsAt) <= date && date <= last)
          cell.append(el("span", { class: "bar state-" + c.state, title: c.title + " (" + c.state + ")" }, c.title));
      }
      row.append(cell);
      if ((offset + d) % 7 === 0) { body.append(row); row = el("tr"); }
    }
    if (row.children.length) body.append(row);
    const head = el("tr", {}, ...["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((n) => el("th", { scope: "col" }, n)));
    const name = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
    months.append(el("div", { class: "month" }, el("h3", {}, name), el("table", {}, el("thead", {}, head), body)));
  }
};

const copy = async (text, button) => {
  try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; }
  catch { window.prompt("Copy the link", text); }
};

const showChecklist = async (row) => {
  const detail = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  detail.hidden = false;
  document.getElementById("detail-title").textContent = row.title + ": go-live checklist";
  body.replaceChildren(el("p", { class: "muted" }, "Running the checks…"));
  try {
    const data = await api("/api/campaigns/" + row.handle + "/check");
    const mark = { ok: "✓", warning: "!", error: "✗" };
    const list = el("ul", { class: "findings" }, ...data.findings.map((f) => el("li", { class: "finding-" + f.level }, mark[f.level] + " " + f.message)));
    const errors = data.findings.filter((f) => f.level === "error").length;
    const signOff = el("button", { class: "primary", type: "button", onclick: async () => {
      signOff.disabled = true;
      try { await api("/api/campaigns/" + row.handle + "/approve", { method: "POST" }); await showChecklist(row); }
      catch (error) { signOff.disabled = false; body.append(el("p", { class: "finding-error" }, "Couldn't sign off: " + error.message)); }
    } }, "Sign off as me");
    body.replaceChildren(
      el("p", {}, errors === 0 ? "No errors." : errors + " error" + (errors === 1 ? "" : "s") + " to fix before it goes live."),
      list,
      signOff,
      el("p", { class: "muted" }, "Signing off records your name and the time on the campaign. Any later edit needs signing off again."),
    );
  } catch (error) {
    body.replaceChildren(el("p", { class: "finding-error" }, "The checks couldn't run: " + error.message));
  }
};

const showHistory = async (row) => {
  const detail = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  detail.hidden = false;
  document.getElementById("detail-title").textContent = row.title + ": change log";
  body.replaceChildren(el("p", { class: "muted" }, "Loading…"));
  try {
    const entries = await api("/api/campaigns/" + row.handle + "/history");
    if (entries.length === 0) { body.replaceChildren(el("p", {}, "No changes logged yet.")); return; }
    const short = (v) => v === null ? "(empty)" : v.length > 80 ? v.slice(0, 77) + "…" : v;
    body.replaceChildren(el("ul", {}, ...entries.map((e) => el("li", {}, ukTime(e.at) + " · " + e.topic.replace("metaobjects/", ""),
      el("ul", {}, ...e.changes.map((c) => el("li", {}, c.field + ": " + short(c.before) + " → " + short(c.after))))))));
  } catch (error) {
    body.replaceChildren(el("p", { class: "finding-error" }, "The change log couldn't load: " + error.message));
  }
};

const renderRows = (data) => {
  const rows = document.getElementById("rows");
  rows.replaceChildren(...data.rows.map((row) => {
    const actions = el("td", {},
      el("button", { type: "button", onclick: () => showChecklist(row) }, "Checklist"),
      el("button", { type: "button", onclick: () => showHistory(row) }, "Change log"));
    if (row.preview.web) actions.append(el("a", { class: "button", href: row.preview.web, target: "_blank", rel: "noopener" }, "Preview on web"));
    if (row.preview.app) {
      const b = el("button", { type: "button" }, "Copy app preview link");
      b.addEventListener("click", () => copy(row.preview.app, b));
      actions.append(b);
    }
    return el("tr", {},
      el("td", {}, row.title, el("br"), el("code", {}, row.handle)),
      el("td", {}, el("span", { class: "pill state-" + row.state }, row.state)),
      el("td", {}, ukTime(row.startsAt) + " → " + ukTime(row.endsAt)),
      actions);
  }));
};

try {
  const data = await api("/api/calendar");
  document.getElementById("status").textContent = data.rows.length + " campaign" + (data.rows.length === 1 ? "" : "s") + ".";
  if (data.notes.length) {
    document.getElementById("notes-section").hidden = false;
    document.getElementById("notes").replaceChildren(...data.notes.map((n) => el("li", {}, n)));
  }
  renderMonths(data);
  renderRows(data);
} catch (error) {
  document.getElementById("status").textContent = "Couldn't load the campaigns: " + error.message;
}
</script>
</body>
</html>`;

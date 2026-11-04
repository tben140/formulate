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
  form.grid { display: grid; gap: 8px 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; }
  label { display: grid; gap: 2px; font-size: 13px; }
  input, select, textarea { font: inherit; padding: 4px 6px; border: 1px solid #94a3b8; border-radius: 6px; }
  .side { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .side > div { border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .side h3 { margin: 0 0 6px; font-size: 14px; }
  table.margins { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.margins td, table.margins th { padding: 2px 4px; border-bottom: 1px solid var(--line); text-align: left; }
  pre { white-space: pre-wrap; font-size: 12px; background: var(--bg); padding: 6px; border-radius: 6px; }
</style>
</head>
<body>
<h1>Campaign calendar</h1>
<p class="muted" id="status">Loading campaigns…</p>
<section id="notes-section" hidden><h2>Needs attention</h2><ul class="notes" id="notes"></ul></section>
<section><h2>Calendar</h2><div class="months" id="months"></div>
  <p class="muted">Bars are campaigns, by state: <span class="pill state-live">live</span> <span class="pill state-upcoming">upcoming</span> <span class="pill state-draft">draft</span> <span class="pill state-ended">ended</span>. Italics are UK retail days.</p></section>
<section><h2>Campaigns</h2><table class="list"><thead><tr><th>Campaign</th><th>State</th><th>Runs (UK)</th><th></th></tr></thead><tbody id="rows"></tbody></table></section>
<section><h2>Customer segments</h2><p class="muted" id="segments-status">Loading…</p><table class="margins" id="segments" hidden><thead><tr><th>Segment</th><th>Customers</th></tr></thead><tbody id="segment-rows"></tbody></table></section>
<section><h2>New campaign</h2>
  <form class="grid" id="new-form">
    <label>Start from<select name="source" id="new-source"></select></label>
    <label>Handle<input name="handle" required pattern="[a-z0-9-]{1,64}" placeholder="january-reset-2027"></label>
    <label>Starts (your time)<input name="startsAt" type="datetime-local" required></label>
    <label>Ends (your time)<input name="endsAt" type="datetime-local" required></label>
    <button class="primary" type="submit">Create as a draft</button>
  </form>
  <p class="muted" id="new-status">A draft shows nowhere until it's published. It needs its products, copy and sign-off first.</p>
</section>
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
      el("button", { type: "button", onclick: () => showOffer(row) }, "Offer"),
      el("button", { type: "button", onclick: () => showHistory(row) }, "Change log"),
      row.state === "ended"
        ? el("button", { type: "button", onclick: () => showResults(row) }, "Results")
        : el("button", { type: "button", onclick: () => showStock(row) }, "Stock"));
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

const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const field = (label, input) => el("label", {}, label, input);
const num = (name, value, attrs = {}) => el("input", { name, type: "number", step: "any", value: value ?? "", ...attrs });

/** The offer editor (SHO-206): a form for the rules the Function understands. */
const showOffer = async (row) => {
  const detail = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  detail.hidden = false;
  document.getElementById("detail-title").textContent = row.title + ": offer";
  body.replaceChildren(el("p", { class: "muted" }, "Loading the saved offer…"));
  let saved = {};
  try {
    const first = await post("/api/campaigns/" + row.handle + "/offer/preview", { offerRules: "{}" });
    if (first.saved) saved = JSON.parse(first.saved.rules);
  } catch {}

  const type = el("select", { name: "type" }, ...["percent", "tiered", "bundle", "gift"].map((t) => el("option", t === (saved.type ?? "percent") ? { value: t, selected: "" } : { value: t }, t)));
  const percent = num("percent", saved.percent ?? 25, { min: 1, max: 100 });
  const tiers = [0, 1, 2].map((i) => [num("tierMin" + i, saved.tiers?.[i]?.minSubtotal), num("tierPercent" + i, saved.tiers?.[i]?.percent, { min: 1, max: 100 })]);
  const buy = num("buy", saved.buy ?? 3, { min: 2, max: 10 });
  const free = num("free", saved.free ?? 1, { min: 1, max: 9 });
  const giftMin = num("giftMin", saved.minSubtotal ?? "40.00");
  const giftVariant = el("input", { name: "variantId", value: saved.variantId ?? "", placeholder: "gid://shopify/ProductVariant/…" });
  const giftLabel = el("input", { name: "giftLabel", value: saved.giftLabel ?? "gift" });
  const appliesTo = el("select", { name: "appliesTo" }, ...[["one_time", "One-time purchases"], ["subscriptions", "New subscriptions (first delivery)"], ["all", "Both"]].map(([v, l]) => el("option", v === (saved.appliesTo ?? "one_time") ? { value: v, selected: "" } : { value: v }, l)));
  const maxUnits = num("maxUnits", saved.maxUnits, { min: 1, max: 99 });
  const once = el("input", saved.oncePerCustomer ? { type: "checkbox", checked: "" } : { type: "checkbox" });
  const ship = el("input", saved.shipping ? { type: "checkbox", checked: "" } : { type: "checkbox" });
  const shipMin = num("shipMin", saved.shipping?.minSubtotal ?? "0.00");
  const shipMax = num("shipMax", saved.shipping?.maxRate);

  const groups = {
    percent: el("div", { class: "grid" }, field("Percent off", percent)),
    tiered: el("div", { class: "grid" }, ...tiers.flatMap(([m, p], i) => [field("Tier " + (i + 1) + ": spend from £", m), field("Tier " + (i + 1) + ": percent off", p)])),
    bundle: el("div", { class: "grid" }, field("Buy", buy), field("Of which free", free)),
    gift: el("div", { class: "grid" }, field("Free gift over £", giftMin), field("Gift variant", giftVariant), field("Gift label", giftLabel)),
  };
  const money = (v) => (v === "" || v === null || v === undefined ? null : Number(v).toFixed(2));
  const rules = () => {
    const r = { type: type.value };
    if (type.value === "percent") r.percent = Number(percent.value);
    if (type.value === "tiered") r.tiers = tiers.filter(([m, p]) => m.value !== "" && p.value !== "").map(([m, p]) => ({ minSubtotal: money(m.value), percent: Number(p.value) }));
    if (type.value === "bundle") { r.buy = Number(buy.value); r.free = Number(free.value); }
    if (type.value === "gift") { r.minSubtotal = money(giftMin.value); r.variantId = giftVariant.value.trim(); r.giftLabel = giftLabel.value.trim(); }
    r.appliesTo = appliesTo.value;
    if (maxUnits.value !== "") r.maxUnits = Number(maxUnits.value);
    if (once.checked) r.oncePerCustomer = true;
    if (Array.isArray(saved.audienceTags) && saved.audienceTags.length) r.audienceTags = saved.audienceTags;
    if (ship.checked) { r.shipping = { minSubtotal: money(shipMin.value) ?? "0.00" }; if (shipMax.value !== "") r.shipping.maxRate = money(shipMax.value); }
    return r;
  };

  const json = el("pre");
  const sides = el("div", { class: "side" });
  const status = el("p", { class: "muted" });
  const marginTable = (p) => el("table", { class: "margins" },
    el("thead", {}, el("tr", {}, el("th", {}, "Lowest margins"), el("th", {}, "Price"), el("th", {}, "At worst"), el("th", {}, "Margin"))),
    el("tbody", {}, ...p.lowest.map((m) => el("tr", {}, el("td", {}, m.title), el("td", {}, "£" + m.price.toFixed(2)), el("td", {}, "£" + m.worst.toFixed(2)), el("td", { class: m.margin < p.minMargin ? "finding-error" : "" }, m.margin + "%")))));
  const side = (title, p) => el("div", {}, el("h3", {}, title),
    p.valid
      ? el("div", {}, el("p", {}, p.words), el("p", { class: p.underFloor ? "finding-error" : "finding-ok" }, p.underFloor + " of " + p.variants + " variants under a " + p.minMargin + "% margin" + (p.withoutCost ? " (" + p.withoutCost + " without a unit cost)" : "") + "."), marginTable(p), el("p", { class: "muted" }, "Terms it writes:"), el("p", {}, p.terms))
      : el("p", { class: "finding-error" }, p.error));

  let timer;
  const refresh = () => {
    for (const [name, group] of Object.entries(groups)) group.hidden = name !== type.value;
    shipMin.disabled = shipMax.disabled = !ship.checked;
    const text = JSON.stringify(rules());
    json.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const result = await post("/api/campaigns/" + row.handle + "/offer/preview", { offerRules: text });
        sides.replaceChildren(...[result.saved ? side("Saved offer", result.saved.preview) : el("div", {}, el("h3", {}, "Saved offer"), el("p", { class: "muted" }, "None yet: the campaign uses its plain discount.")), side("This offer", result.edited)]);
      } catch (error) { sides.replaceChildren(el("p", { class: "finding-error" }, "Preview failed: " + error.message)); }
    }, 400);
  };

  const save = el("button", { class: "primary", type: "button", onclick: async () => {
    if (!window.confirm("Save this offer to " + row.title + " and update its discount? A new discount starts switched off, and the campaign needs signing off again.")) return;
    save.disabled = true;
    try {
      const result = await post("/api/campaigns/" + row.handle + "/offer", { offerRules: JSON.stringify(rules()) });
      status.replaceChildren(...[...(result.synced ?? []).map((line) => el("span", { class: "finding-ok" }, line + " ")), result.error ? el("span", { class: "finding-error" }, result.error) : "",
        el("a", { href: "shopify://admin/discounts", target: "_top" }, "Open discounts in Shopify to switch it on")]);
    } catch (error) { status.textContent = "Couldn't save: " + error.message; }
    save.disabled = false;
  } }, "Save offer and update its discount");

  const form = el("form", { class: "grid" }, field("Offer type", type), field("Applies to", appliesTo), field("Most of each product (optional)", maxUnits), field("Once per customer (signed in)", once), field("Free delivery too", ship), field("Free delivery from £", shipMin), field("Up to delivery rate £ (optional)", shipMax));
  form.addEventListener("input", refresh);
  for (const g of Object.values(groups)) g.addEventListener("input", refresh);
  body.replaceChildren(form, ...Object.values(groups), el("p", { class: "muted" }, "As the discount Function reads it:"), json, sides, save, status);
  refresh();
};

/** Stock against the plan (SHO-209). */
const showStock = async (row) => {
  const detail = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  detail.hidden = false;
  document.getElementById("detail-title").textContent = row.title + ": stock against the plan";
  body.replaceChildren(el("p", { class: "muted" }, "Forecasting…"));
  try {
    const data = await api("/api/campaigns/" + row.handle + "/stock");
    if (data.error) { body.replaceChildren(el("p", { class: "finding-error" }, data.error)); return; }
    const short = data.lines.filter((l) => l.short).length;
    body.replaceChildren(
      el("p", {}, short ? short + " product" + (short === 1 ? "" : "s") + " likely to sell out." : "Every product should last the campaign."),
      el("p", { class: "muted" }, "Forecast: the last 28 days' daily sales × " + (Math.round(data.days * 10) / 10) + " days × " + (data.uplift ?? 3) + (data.upliftFrom ? " (the uplift " + data.upliftFrom + " showed)" : " (a default uplift; this shop has no past campaign to learn from yet)") + "."),
      el("table", { class: "margins" },
        el("thead", {}, el("tr", {}, el("th", {}, "Product"), el("th", {}, "In stock"), el("th", {}, "Sells a day"), el("th", {}, "Likely to sell"))),
        el("tbody", {}, ...data.lines.map((l) => el("tr", {}, el("td", { class: l.short ? "finding-error" : "" }, l.product), el("td", {}, l.stock === null ? "not tracked" : String(l.stock)), el("td", {}, String(l.perDay)), el("td", {}, String(l.expected)))))));
  } catch (error) { body.replaceChildren(el("p", { class: "finding-error" }, "The forecast couldn't run: " + error.message)); }
};

/** Did the campaign's buyers come back: 30, 60 and 90 days on. */
const cohortPart = (c) => {
  if (!c || !c.buyers) return [el("p", { class: "muted" }, "No signed-in buyers to follow" + (c && c.guests ? " (" + c.guests + " guest orders can't be)" : "") + ".")];
  return [
    el("p", {}, c.buyers + " buyers followed, " + c.firstTime + " of them new" + (c.guests ? "; " + c.guests + " guest orders can't be followed" : "") + "."),
    el("table", { class: "margins" },
      el("thead", {}, el("tr", {}, el("th", {}, "After"), el("th", {}, "Ordered again"), el("th", {}, "Subscribed"))),
      el("tbody", {}, ...c.windows.map((w) => el("tr", {},
        el("td", {}, w.days + " days" + (w.days > c.daysSoFar ? " (so far)" : "")),
        el("td", {}, w.returned + " of " + c.buyers),
        el("td", {}, w.subscribed + " of " + c.buyers))))),
  ];
};

/** Who's in each customer segment (SHO-207), as last counted. */
const SEGMENT_NAMES = { active: "Active subscribers", lapsed: "Lapsed subscribers", at_risk: "At risk", one_time: "One-time buyers", dormant: "Dormant", best: "Best customers" };
const showSegments = async () => {
  const status = document.getElementById("segments-status");
  try {
    const data = await api("/api/segments");
    if (data.error) { status.textContent = data.error; return; }
    status.textContent = "Counted " + new Date(data.syncedAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) + ". Thresholds are on the Campaign settings record.";
    document.getElementById("segment-rows").replaceChildren(...Object.entries(data.counts).map(([key, n]) => el("tr", {}, el("td", {}, SEGMENT_NAMES[key] ?? key), el("td", {}, String(n)))));
    document.getElementById("segments").hidden = false;
  } catch (error) { status.textContent = "Segments couldn't load: " + error.message; }
};

/** After a campaign (SHO-209): its results, and tidying up. */
const showResults = async (row) => {
  const detail = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  detail.hidden = false;
  document.getElementById("detail-title").textContent = row.title + ": results";
  body.replaceChildren(el("p", { class: "muted" }, "Loading…"));
  try {
    const data = await api("/api/campaigns/" + row.handle + "/results");
    if (data.error) { body.replaceChildren(el("p", { class: "muted" }, data.error)); return; }
    const r = data.report;
    const money = (n) => "£" + n.toFixed(2);
    const tidy = el("button", { type: "button", onclick: async () => {
      if (!window.confirm("Tidy " + row.title + "? It comes off its products, its collection is deleted and the record goes back to draft. The report stays.")) return;
      tidy.disabled = true;
      const response = await fetch("/api/campaigns/" + row.handle + "/tidy", { method: "POST" });
      const result = await response.json().catch(() => ({ error: "HTTP " + response.status }));
      body.append(el("p", { class: result.error ? "finding-error" : "finding-ok" }, result.error ?? "Tidied: " + result.tidied + " products and variants taken off it."));
    } }, "Tidy up");
    body.replaceChildren(
      el("ul", {}, el("li", {}, r.orders + " orders, " + money(r.revenue) + " revenue"), el("li", {}, money(r.discountCost) + " given in discounts"),
        el("li", {}, r.firstOrders + " first orders, " + r.subscriptionsStarted + " subscriptions started")),
      el("p", { class: "muted" }, "Top products:"),
      el("ol", {}, ...r.topProducts.slice(0, 5).map((p) => el("li", {}, p.title + " × " + p.quantity))),
      ...cohortPart(data.cohort),
      el("p", {}, data.referrals.referrers
        ? data.referrals.referrers + " referrer" + (data.referrals.referrers === 1 ? "" : "s") + " brought " + data.referrals.orders + " order" + (data.referrals.orders === 1 ? "" : "s") + ". Rewards are issued from the CLI (campaigns referrals --rewards)."
        : "No referral orders yet."),
      tidy);
  } catch (error) { body.replaceChildren(el("p", { class: "finding-error" }, "Results couldn't load: " + error.message)); }
};

const setUpNewForm = (data) => {
  const source = document.getElementById("new-source");
  source.replaceChildren(
    ...data.templates.map((t) => el("option", { value: "template:" + t }, "Template: " + t)),
    ...data.rows.map((r) => el("option", { value: "from:" + r.handle }, "Copy of " + r.title)));
  const formEl = document.getElementById("new-form");
  const status = document.getElementById("new-status");
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = new FormData(formEl);
    const [kind, name] = String(f.get("source")).split(":");
    const body = { handle: f.get("handle"), startsAt: new Date(String(f.get("startsAt"))).toISOString(), endsAt: new Date(String(f.get("endsAt"))).toISOString() };
    body[kind === "template" ? "template" : "from"] = name;
    try {
      const response = await fetch("/api/campaigns/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({ error: "HTTP " + response.status }));
      status.textContent = result.created ? "Created " + result.created + " as a draft. Reload to see it." : "Not created: " + result.error;
    } catch (error) { status.textContent = "Not created: " + error.message; }
  });
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
  setUpNewForm(data);
  showSegments();
} catch (error) {
  document.getElementById("status").textContent = "Couldn't load the campaigns: " + error.message;
}
</script>
</body>
</html>`;

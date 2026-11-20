/**
 * Smoke test for a deployed web storefront: the things a visitor or a crawler
 * meets first, checked from outside with nothing but HTTP.
 *
 * Usage: node apps/web/scripts/smoke.mjs [origin]
 *
 * Defaults to production. Prints one line per check and exits 1 if any check
 * fails, so it can run from a shell on landing day, or from a workflow later.
 *
 * It fetches the sitemap and checks a real product and collection page from
 * it, so it never depends on a handle that a merchant might rename. What it
 * asserts is what the app promises in code: `app/robots.ts`, `app/sitemap.ts`,
 * the canonicals and JSON-LD on the product and collection pages, the
 * security headers in `vercel.json`, and the brand name from
 * `packages/tokens`. A failure here after a deploy means one of those stopped
 * reaching production, or production isn't the deployment that was meant.
 */
const origin = (process.argv[2] ?? "https://www.doublehelixsupplements.co.uk").replace(
  /\/+$/,
  "",
);

/**
 * `BRAND_NAME` from `packages/tokens`, repeated here because that package ships
 * TypeScript and this script runs on bare Node. The old working name must not
 * appear in anything a visitor reads (AGENTS.md).
 */
const BRAND = "Double Helix";
const FORBIDDEN_NAME = "Formulate";

const results = [];
const record = (status, name, detail = "") => {
  results.push({ status, name, detail });
  const mark = status === "PASS" ? "ok  " : status === "WARN" ? "warn" : "FAIL";
  console.log(`${mark}  ${name}${detail ? `  (${detail})` : ""}`);
};
const check = (name, ok, detail) => record(ok ? "PASS" : "FAIL", name, detail);
const warn = (name, ok, detail) => record(ok ? "PASS" : "WARN", name, detail);

/** One request, redirects reported rather than followed. */
const get = async (path, init = {}) => {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "double-helix-smoke/1" },
      ...init,
    });
    const text = await response.text();
    return { url, status: response.status, headers: response.headers, text };
  } catch (error) {
    return { url, status: 0, headers: new Headers(), text: "", error: String(error) };
  }
};

/** A URL's origin, or "" when it isn't one. */
const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
const canonicalOf = (html) =>
  html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ??
  html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i)?.[1] ??
  "";
const robotsMetaOf = (html) =>
  html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i)?.[1] ?? "";
const jsonLdTypes = (html) =>
  [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].flatMap(([, body]) => {
    try {
      const data = JSON.parse(body);
      return (Array.isArray(data) ? data : [data]).map((node) => node["@type"]);
    } catch {
      return ["(unparseable)"];
    }
  });
/** The page's readable text, roughly: no scripts, styles or tags. */
const visibleText = (html) =>
  html
    // `</script >` and `</script foo>` close a script too, so the end tag
    // allows anything up to its `>` (CodeQL: bad HTML filtering regexp). A
    // tag name ends at whitespace, `/` or `>`, not at a hyphen, so
    // `<script-widget>` is an ordinary element.
    .replace(/<script(?=[\s/>])[\s\S]*?<\/script(?=[\s/>])[^>]*>/gi, " ")
    .replace(/<style(?=[\s/>])[\s\S]*?<\/style(?=[\s/>])[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

/** The checks every indexable page gets. */
const checkPage = async (label, path, { noindex = false, types = [] } = {}) => {
  const page = await get(path);
  check(`${label}: 200`, page.status === 200, `${page.status} ${page.url}`);
  if (page.status !== 200) return page;

  const title = titleOf(page.text);
  check(`${label}: title ends with the brand`, title.endsWith(BRAND), title);
  check(
    `${label}: no old name in readable text`,
    !visibleText(page.text).includes(FORBIDDEN_NAME),
  );

  const robotsMeta = robotsMetaOf(page.text);
  if (noindex) {
    check(`${label}: asks not to be indexed`, /noindex/.test(robotsMeta), robotsMeta);
  } else {
    check(
      `${label}: indexable`,
      !/noindex/.test(robotsMeta),
      robotsMeta || "no robots meta",
    );
    const canonical = canonicalOf(page.text);
    check(
      `${label}: canonical is its own URL`,
      canonical === page.url,
      canonical || "none",
    );
  }

  const found = jsonLdTypes(page.text);
  for (const type of types) {
    check(`${label}: JSON-LD ${type}`, found.includes(type), found.join(", ") || "none");
  }
  return page;
};

// 1. The home page is a page, not a redirect (production used to 307 to a
//    collection).
const home = await checkPage("home", "/");
check(
  "home: nosniff header",
  home.headers.get("x-content-type-options") === "nosniff",
  home.headers.get("x-content-type-options") ?? "missing",
);
check(
  "home: referrer policy",
  home.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
  home.headers.get("referrer-policy") ?? "missing",
);

// 2. The apex redirects to www (docs/domains.md).
const host = new URL(origin).host;
if (host.startsWith("www.")) {
  const apex = await get(`https://${host.slice(4)}/`);
  const location = apex.headers.get("location") ?? "";
  // The destination's origin, compared whole: a prefix match would accept a
  // redirect to another host that merely starts with ours.
  check(
    "apex redirects to www",
    [301, 308].includes(apex.status) && originOf(location) === origin,
    `${apex.status} ${location || "no location"}`,
  );
}

// 3. robots.txt allows crawling and names the sitemap.
const robots = await get("/robots.txt");
check("robots.txt: 200", robots.status === 200, String(robots.status));
check("robots.txt: allows /", /Allow:\s*\/\s*$/m.test(robots.text));
check("robots.txt: no Disallow: /", !/Disallow:\s*\/\s*$/m.test(robots.text));
check(
  "robots.txt: names the sitemap",
  robots.text.includes(`Sitemap: ${origin}/sitemap.xml`),
);

// 4. The sitemap lists products and collections on this origin.
const sitemap = await get("/sitemap.xml");
check("sitemap.xml: 200", sitemap.status === 200, String(sitemap.status));
const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
const products = locs.filter((loc) => loc.includes("/products/"));
const collections = locs.filter((loc) => loc.includes("/collections/"));
check("sitemap.xml: has products", products.length > 0, `${products.length}`);
check("sitemap.xml: has collections", collections.length > 0, `${collections.length}`);
check(
  "sitemap.xml: every URL is on this origin",
  locs.every((loc) => loc.startsWith(`${origin}/`)),
  locs.find((loc) => !loc.startsWith(`${origin}/`)) ?? "",
);

// 5. A real product and a real collection page, from the sitemap.
if (products[0]) {
  await checkPage("product", products[0], { types: ["Product", "BreadcrumbList"] });
}
if (collections[0]) {
  await checkPage("collection", collections[0], { types: ["BreadcrumbList"] });
}

// 6. Search is served but kept out of the index.
await checkPage("search", "/search", { noindex: true });

// 7. The policies route exists. The handle is Shopify's, so a 404 is only a
//    warning: the store may name its policies differently.
const policy = await get("/policies/privacy-policy");
warn("policies route", policy.status === 200, String(policy.status));

// 8. What agents and the app's deep links read.
const llms = await get("/llms.txt");
check("llms.txt: 200", llms.status === 200, String(llms.status));
const aasa = await get("/.well-known/apple-app-site-association");
check(
  "apple-app-site-association: 200 JSON",
  aasa.status === 200 && aasa.text.trim().startsWith("{"),
  String(aasa.status),
);

// 9. A missing product is a 404, not a 200 shell or a 500.
const missing = await get("/products/this-product-does-not-exist");
check("unknown product: 404", missing.status === 404, String(missing.status));

const failed = results.filter((result) => result.status === "FAIL").length;
const warned = results.filter((result) => result.status === "WARN").length;
console.log(
  `\n${results.length - failed - warned} passed, ${warned} warnings, ${failed} failed against ${origin}`,
);
process.exit(failed > 0 ? 1 : 0);

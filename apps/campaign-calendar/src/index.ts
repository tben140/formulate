import {
  calendarData,
  checklist,
  HANDLE,
  newCampaign,
  offerPreview,
  resultsFor,
  saveOffer,
  signOff,
  stockFor,
  TEMPLATE_NAMES,
  tidyFor,
} from "./api";
import { page } from "./page";
import { verifySessionToken, type Session } from "./session";
import { offlineAdmin, staffName } from "./shopify";

/**
 * The Campaign Calendar (SHO-205): the Double Helix app's embedded page in
 * the Shopify admin. One Worker serves the page and its API.
 *
 * - `GET /` the page, framed only by the admin (CSP frame-ancestors);
 * - `GET /api/calendar` every campaign, notes, UK retail days, preview links;
 * - `GET /api/campaigns/<handle>/check` the go-live checklist;
 * - `POST /api/campaigns/<handle>/approve` signs it off as the staff member;
 * - `GET /api/campaigns/<handle>/history` the change log (apps/api);
 * - `POST /api/campaigns/<handle>/offer/preview` the offer editor's preview;
 * - `POST /api/campaigns/<handle>/offer` saves the offer, updates its discounts;
 * - `POST /api/campaigns/new` a draft copied from a campaign, or a template;
 * - `GET /api/campaigns/<handle>/stock` stock against the plan;
 * - `GET /api/campaigns/<handle>/results` after it ends: its report;
 * - `POST /api/campaigns/<handle>/tidy` after it ends: `campaigns tidy`.
 *
 * ⚠️ Every /api call needs a valid App Bridge session token for this app and
 * this shop. Admin access is by token exchange, server-side, never stored.
 */
export interface Env {
  /** The app's client id (public). */
  SHOPIFY_APP_CLIENT_ID: string;
  /** The one shop this app serves: "tben140plus-xcorpito.myshopify.com". */
  SHOP_DOMAIN: string;
  /** The storefront's URL, for preview links. */
  WEB_URL: string;
  /** apps/api's URL, for the change log. */
  API_URL: string;
  /** Secret: the app's client secret (`wrangler secret put`). */
  SHOPIFY_APP_CLIENT_SECRET: string;
  /** Secret: web's CAMPAIGN_PREVIEW_TOKEN, for preview links. Optional. */
  CAMPAIGN_PREVIEW_TOKEN?: string;
  /** Secret: apps/api's CAMPAIGN_LOG_TOKEN, for the change log. Optional. */
  CAMPAIGN_LOG_TOKEN?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const session = async (request: Request, env: Env): Promise<Session | null> => {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifySessionToken(token, {
    clientId: env.SHOPIFY_APP_CLIENT_ID,
    secret: env.SHOPIFY_APP_CLIENT_SECRET,
    shop: env.SHOP_DOMAIN,
  });
};

/** A small JSON object body, or null. */
const readJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > 10_000) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const handle = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app")) {
    return new Response(page(env.SHOPIFY_APP_CLIENT_ID), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Shopify requires embedded apps to be frameable by the admin only.
        "content-security-policy": `frame-ancestors https://${env.SHOP_DOMAIN} https://admin.shopify.com;`,
        "cache-control": "no-store",
      },
    });
  }

  if (!url.pathname.startsWith("/api/"))
    return new Response("Not found", { status: 404 });

  const who = await session(request, env);
  if (!who) return json({ error: "unauthorized" }, 401);

  try {
    if (request.method === "GET" && url.pathname === "/api/calendar") {
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      return json({
        ...(await calendarData(admin, {
          webUrl: env.WEB_URL,
          previewToken: env.CAMPAIGN_PREVIEW_TOKEN,
        })),
        templates: TEMPLATE_NAMES,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/campaigns/new") {
      const body = await readJson(request);
      if (!body) return json({ error: "bad request" }, 400);
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      const result = await newCampaign(admin, body);
      return json(result, "error" in result ? 400 : 201);
    }

    const offer = /^\/api\/campaigns\/([^/]+)\/offer(\/preview)?$/.exec(url.pathname);
    if (offer && request.method === "POST") {
      const handle = offer[1] ?? "";
      const body = await readJson(request);
      const rules = typeof body?.offerRules === "string" ? body.offerRules : null;
      if (!HANDLE.test(handle) || !rules || rules.length > 4000)
        return json({ error: "bad request" }, 400);
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      const result = offer[2]
        ? await offerPreview(admin, handle, rules)
        : await saveOffer(admin, handle, rules);
      return result ? json(result) : json({ error: "not found" }, 404);
    }

    const match =
      /^\/api\/campaigns\/([^/]+)\/(check|approve|history|stock|results|tidy)$/.exec(
        url.pathname,
      );
    const handle = match?.[1] ?? "";
    if (!match || !HANDLE.test(handle)) return json({ error: "not found" }, 404);

    if (match[2] === "check" && request.method === "GET") {
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      const result = await checklist(admin, handle);
      return result ? json(result) : json({ error: "not found" }, 404);
    }

    if (match[2] === "approve" && request.method === "POST") {
      const name = await staffName(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      if (!name) return json({ error: "no staff name" }, 403);
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      return (await signOff(admin, handle, name))
        ? json({ approvedBy: name })
        : json({ error: "not found" }, 404);
    }

    if ((match[2] === "stock" || match[2] === "results") && request.method === "GET") {
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      const result =
        match[2] === "stock"
          ? await stockFor(admin, handle)
          : await resultsFor(admin, handle);
      return result ? json(result) : json({ error: "not found" }, 404);
    }

    if (match[2] === "tidy" && request.method === "POST") {
      const admin = await offlineAdmin(
        who,
        env.SHOPIFY_APP_CLIENT_ID,
        env.SHOPIFY_APP_CLIENT_SECRET,
      );
      const result = await tidyFor(admin, handle);
      return result
        ? json(result, "error" in result ? 409 : 200)
        : json({ error: "not found" }, 404);
    }

    if (match[2] === "history" && request.method === "GET") {
      if (!env.CAMPAIGN_LOG_TOKEN) return json([]);
      const log = new URL("/campaigns/log", env.API_URL);
      log.searchParams.set("handle", handle);
      const response = await fetch(log, {
        headers: { authorization: `Bearer ${env.CAMPAIGN_LOG_TOKEN}` },
      });
      if (!response.ok) return json({ error: "change log unavailable" }, 502);
      return json(await response.json());
    }

    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    // Logged, never returned: messages can carry store detail.
    console.error(
      `[calendar] ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return json({ error: "failed" }, 502);
  }
};

export default { fetch: handle } satisfies ExportedHandler<Env>;

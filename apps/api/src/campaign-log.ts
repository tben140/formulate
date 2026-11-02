import { DurableObject } from "cloudflare:workers";

/**
 * The campaigns' change log (SHO-169): every edit to a `campaign` record, with
 * what changed, so a late change to the terms or the dates can't go unseen.
 *
 * Shopify sends `metaobjects/create|update|delete` webhooks for the type
 * `campaign` here (apps/shopify-app/shopify.app.toml), signed with the app's
 * client secret. One Durable Object keeps each campaign's last fields and the
 * log (SQLite, as the rate limiter). `campaigns history <handle>` reads it
 * with a bearer token. Shopify's webhook doesn't say who made an edit, so the
 * log says what and when; `approved_by` on the record says who signed off.
 */

export interface LogEntry {
  readonly at: string;
  readonly topic: string;
  readonly handle: string;
  readonly changes: readonly {
    readonly field: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
}

/** What differs between two sets of field values, by key, sorted. */
export const diffFields = (
  before: Readonly<Record<string, string | null>>,
  after: Readonly<Record<string, string | null>>,
): LogEntry["changes"] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((field) => (before[field] ?? null) !== (after[field] ?? null))
    .map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));

/**
 * Shopify's metaobject webhook body as field values. Fields arrive as
 * `{ key: { value } }` or `{ key: value }` depending on the payload version;
 * both are read, and anything else is stringified.
 */
export const webhookFields = (body: unknown): Record<string, string | null> => {
  const fields = (body as { fields?: unknown } | null)?.fields;
  if (!fields || typeof fields !== "object") return {};
  return Object.fromEntries(
    Object.entries(fields as Record<string, unknown>).map(([key, raw]) => {
      const value =
        raw && typeof raw === "object" && "value" in raw
          ? (raw as { value: unknown }).value
          : raw;
      return [
        key,
        value === null || value === undefined
          ? null
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
      ];
    }),
  );
};

/** Shopify's webhook signature: base64 HMAC-SHA256 of the raw body, compared in constant time. */
export const verifyShopifyHmac = async (
  body: string,
  header: string | null,
  secret: string,
): Promise<boolean> => {
  if (!header || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return sameText(btoa(String.fromCharCode(...mac)), header);
};

/** Two strings equal, in time that doesn't depend on where they differ. */
export const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const KEEP = 500;

export class CampaignLog extends DurableObject {
  /** The tables, made on first use (idempotent). */
  private tables() {
    // One statement per exec: a second one in the same string doesn't run.
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS state (handle TEXT PRIMARY KEY, fields TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, topic TEXT NOT NULL, handle TEXT NOT NULL, changes TEXT NOT NULL)",
    );
  }

  /** Records an edit; returns the entry, or null when nothing changed (a retry, or a no-op save). */
  record(
    topic: string,
    handle: string,
    fields: Record<string, string | null>,
    at: string,
  ): LogEntry | null {
    this.tables();
    const row = this.ctx.storage.sql
      .exec<{ fields: string }>("SELECT fields FROM state WHERE handle = ?", handle)
      .toArray()[0];
    const before = row ? (JSON.parse(row.fields) as Record<string, string | null>) : {};
    const after = topic === "metaobjects/delete" ? {} : fields;
    const changes = diffFields(before, after);
    if (changes.length === 0 && topic === "metaobjects/update") return null;
    if (topic === "metaobjects/delete")
      this.ctx.storage.sql.exec("DELETE FROM state WHERE handle = ?", handle);
    else
      this.ctx.storage.sql.exec(
        "INSERT INTO state (handle, fields) VALUES (?, ?) ON CONFLICT(handle) DO UPDATE SET fields = excluded.fields",
        handle,
        JSON.stringify(after),
      );
    this.ctx.storage.sql.exec(
      "INSERT INTO log (at, topic, handle, changes) VALUES (?, ?, ?, ?)",
      at,
      topic,
      handle,
      JSON.stringify(changes),
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM log WHERE id <= (SELECT MAX(id) FROM log) - ?",
      KEEP,
    );
    return { at, topic, handle, changes };
  }

  /** The newest entries first, for one campaign or all. */
  history(handle: string | null, limit: number): LogEntry[] {
    this.tables();
    const rows = handle
      ? this.ctx.storage.sql.exec<{
          at: string;
          topic: string;
          handle: string;
          changes: string;
        }>(
          "SELECT at, topic, handle, changes FROM log WHERE handle = ? ORDER BY id DESC LIMIT ?",
          handle,
          limit,
        )
      : this.ctx.storage.sql.exec<{
          at: string;
          topic: string;
          handle: string;
          changes: string;
        }>("SELECT at, topic, handle, changes FROM log ORDER BY id DESC LIMIT ?", limit);
    return rows
      .toArray()
      .map((r) => ({ ...r, changes: JSON.parse(r.changes) as LogEntry["changes"] }));
  }
}

interface LogEnv {
  readonly SHOPIFY_APP_CLIENT_SECRET?: string;
  readonly CAMPAIGN_LOG_TOKEN?: string;
  readonly CAMPAIGN_LOG: DurableObjectNamespace<CampaignLog>;
}

const MAX_WEBHOOK_BYTES = 64 * 1024;
const TOPICS = new Set([
  "metaobjects/create",
  "metaobjects/update",
  "metaobjects/delete",
]);
const plain = (status: number) =>
  new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * The two routes, or null for any other path (the caller carries on). The
 * webhook answers 200 once recorded or ignored, 401 on a bad signature, so
 * Shopify retries only what failed. The log needs the bearer token; without
 * one configured it's closed.
 */
export const campaignLogRoute = async (
  request: Request,
  env: LogEnv,
): Promise<Response | null> => {
  const url = new URL(request.url);
  const log = () => env.CAMPAIGN_LOG.get(env.CAMPAIGN_LOG.idFromName("campaigns"));

  if (url.pathname === "/webhooks/shopify/campaigns") {
    if (request.method !== "POST") return plain(405);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_WEBHOOK_BYTES) return plain(413);
    const body = await request.text();
    if (body.length > MAX_WEBHOOK_BYTES) return plain(413);
    const signed = await verifyShopifyHmac(
      body,
      request.headers.get("x-shopify-hmac-sha256"),
      env.SHOPIFY_APP_CLIENT_SECRET ?? "",
    );
    if (!signed) return plain(401);
    const topic = request.headers.get("x-shopify-topic") ?? "";
    let payload: { type?: unknown; handle?: unknown; updated_at?: unknown };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return plain(400);
    }
    if (
      !TOPICS.has(topic) ||
      payload.type !== "campaign" ||
      typeof payload.handle !== "string"
    )
      return plain(200);
    await log().record(
      topic,
      payload.handle,
      webhookFields(payload),
      typeof payload.updated_at === "string"
        ? payload.updated_at
        : new Date().toISOString(),
    );
    return plain(200);
  }

  if (url.pathname === "/campaigns/log") {
    if (request.method !== "GET") return plain(405);
    const token = env.CAMPAIGN_LOG_TOKEN ?? "";
    const given = request.headers.get("authorization") ?? "";
    if (!token || !sameText(given, `Bearer ${token}`)) return plain(401);
    const handle = url.searchParams.get("handle");
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50),
    );
    return new Response(JSON.stringify(await log().history(handle, limit)), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return null;
};

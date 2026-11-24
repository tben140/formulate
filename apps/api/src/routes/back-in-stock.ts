import {
  KLAVIYO_REVISION,
  SERVER_BACK_IN_STOCK_URL,
  backInStockPayload,
  catalogVariantId,
  isPlausibleEmail,
} from "@formulate/analytics";

import { readBounded } from "../body";
import { json } from "../http";
import type { RateLimiter } from "../rate-limiter";

/**
 * Restock alerts from the app (SHO-118): Klaviyo emails the shopper once when
 * the variant is back. The same public-endpoint rules as the newsletter
 * sign-up (routes/subscribe.ts), with one more field read: the variant.
 */

export interface BackInStockEnv {
  /**
   * A separate key with catalogs:write and profiles:write, so each key can do
   * only its own job. Optional: until it's set, this route answers 503 and the
   * newsletter is unaffected.
   */
  readonly KLAVIYO_BACK_IN_STOCK_KEY?: string;
  /** Shared with the sign-up: one budget per IP across both routes. */
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

/** An email and a variant id; anything longer isn't a restock request. */
const MAX_BODY_BYTES = 1024;

export const handleBackInStock = async (
  request: Request,
  env: BackInStockEnv,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "rejected" }, 405);
  }
  // Media types are case-insensitive and may carry parameters (charset), so
  // compare the bare type exactly: `includes` would also pass text/x-application/json.
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return json({ ok: false, reason: "rejected" }, 415);
  }

  // `CF-Connecting-IP` is set by Cloudflare's edge; see routes/subscribe.ts.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip)).limit();
  if (!success) {
    return json({ ok: false, reason: "rate-limited" }, 429);
  }

  const raw = await readBounded(request, MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, reason: "rejected" }, 413);
  }

  let body: { email?: unknown; variant?: unknown };
  try {
    const parsed: unknown = JSON.parse(raw);
    // `null`, an array or a number parses fine but can't be destructured.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, reason: "rejected" }, 400);
    }
    body = parsed as typeof body;
  } catch {
    return json({ ok: false, reason: "rejected" }, 400);
  }

  // ⚠️ Two fields read, nothing forwarded: the payload is built from them.
  const { email, variant } = body;
  if (typeof email !== "string" || !isPlausibleEmail(email)) {
    return json({ ok: false, reason: "invalid-email" }, 400);
  }
  const variantId =
    typeof variant === "string" || typeof variant === "number"
      ? catalogVariantId(variant)
      : null;
  if (!variantId) return json({ ok: false, reason: "rejected" }, 400);

  if (!env.KLAVIYO_BACK_IN_STOCK_KEY) {
    console.error("back-in-stock: KLAVIYO_BACK_IN_STOCK_KEY is not set");
    return json({ ok: false, reason: "rejected" }, 503);
  }

  const response = await fetch(SERVER_BACK_IN_STOCK_URL, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_BACK_IN_STOCK_KEY}`,
      "content-type": "application/vnd.api+json",
      revision: KLAVIYO_REVISION,
    },
    body: JSON.stringify(backInStockPayload({ email, variantId })),
  });

  if (!response.ok) {
    // Logged without the address, as the sign-up does.
    console.error("klaviyo back-in-stock failed", {
      status: response.status,
      detail: (await response.text()).slice(0, 500),
    });
    return json({ ok: false, reason: "rejected" }, 502);
  }
  return json({ ok: true }, 202);
};

import {
  KLAVIYO_REVISION,
  SERVER_SUBSCRIBE_URL,
  isPlausibleEmail,
  serverSubscriptionPayload,
} from "@formulate/analytics";

import { readBounded } from "../body";
import { json } from "../http";
import type { RateLimiter } from "../rate-limiter";
import { reportError, type SentryEnv } from "../sentry";

/**
 * Klaviyo consent proxy: the app's newsletter sign-up.
 *
 * The mobile app cannot record marketing consent itself. Klaviyo's React
 * Native SDK has no consent API — `Profile` carries no subscriptions field and
 * there is no subscribe method — and the client-side `/client/subscriptions/`
 * endpoint is unreachable from a native app, where Cloudflare answers with a
 * 403 HTML interstitial rather than a Klaviyo response. Klaviyo's own in-app
 * forms cannot collect consent yet either.
 *
 * That leaves a server call with a private key, which is also what Klaviyo's
 * documentation prescribes. See docs/adr/0007.
 *
 * ⚠️ This is a **public, unauthenticated endpoint holding a credential**.
 * Everything below follows from that. The threat is not someone stealing the
 * key — it is someone borrowing this worker's authority without ever needing
 * it.
 */

export interface SubscribeEnv {
  /** Set with `wrangler secret put`. Never in `vars`, never in the repo. */
  readonly KLAVIYO_PRIVATE_KEY: string;
  readonly KLAVIYO_LIST_ID: string;
  /**
   * One Durable Object per IP. Not Cloudflare's `ratelimits` binding — see
   * src/rate-limiter.ts for why that one was removed.
   */
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

/**
 * Generous for a form submission, tight for anything constructing a payload.
 * Enforced while reading (see body.ts), so a large body is cut off rather
 * than buffered and then measured.
 */
const MAX_BODY_BYTES = 1024;

export const handleSubscribe = async (
  request: Request,
  env: SubscribeEnv & SentryEnv,
  ctx?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "rejected" }, 405);
  }

  // Rejected before the body is read. An attacker should not be able to make
  // us buffer or parse anything by being wrong about the content type.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ ok: false, reason: "rejected" }, 415);
  }

  /*
   * Rate limit keyed on the connecting IP.
   *
   * `CF-Connecting-IP` is set by Cloudflare's edge and cannot be spoofed by
   * the client — unlike `X-Forwarded-For`, which is caller-supplied and
   * would make this control trivially bypassable.
   */
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip)).limit();
  if (!success) {
    return json({ ok: false, reason: "rate-limited" }, 429);
  }

  const raw = await readBounded(request, MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, reason: "rejected" }, 413);
  }

  let email: unknown;
  try {
    /*
     * ⚠️ Exactly one field is read, and nothing is forwarded.
     *
     * The Klaviyo payload is constructed below from this address and the
     * worker's own list id. Merging a caller-supplied object into it would
     * let anyone choose the destination list, set arbitrary profile
     * properties, or forge `custom_source` — and validating such a body
     * safely is harder than never accepting one.
     */
    email = (JSON.parse(raw) as { email?: unknown }).email;
  } catch {
    return json({ ok: false, reason: "rejected" }, 400);
  }

  if (typeof email !== "string" || !isPlausibleEmail(email)) {
    return json({ ok: false, reason: "invalid-email" }, 400);
  }

  const response = await fetch(SERVER_SUBSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_PRIVATE_KEY}`,
      "content-type": "application/vnd.api+json",
      revision: KLAVIYO_REVISION,
    },
    body: JSON.stringify(
      serverSubscriptionPayload({
        email,
        listId: env.KLAVIYO_LIST_ID,
        source: "Double Helix mobile",
      }),
    ),
  });

  if (!response.ok) {
    /*
     * Logged, never returned. Cloudflare's observability captures this, so
     * the address is deliberately absent — an email is personal data, and
     * the status plus Klaviyo's own message is enough to diagnose with.
     */
    console.error("klaviyo subscribe failed", {
      status: response.status,
      detail: (await response.text()).slice(0, 500),
    });
    // Sentry gets the status only. Klaviyo's message can quote the address.
    if (ctx) {
      reportError(env.SENTRY_DSN, ctx, {
        message: "Klaviyo subscribe failed",
        level: "error",
        extra: { status: response.status },
      });
    }
    return json({ ok: false, reason: "rejected" }, 502);
  }

  /*
   * 202 from Klaviyo means queued, not recorded — and with a double opt-in
   * list nobody joins until they click a confirmation link. So `ok` here
   * means "accepted for processing", which is exactly what the mobile copy
   * is worded to claim and no more.
   */
  return json({ ok: true }, 202);
};

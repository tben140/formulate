import { DurableObject } from "cloudflare:workers";

import { POSTHOG_CAPTURE_URL, type CapturedOrderEvent } from "@formulate/analytics";

import { readBounded } from "./order-webhook";
import type { RateLimiter } from "./rate-limiter";

/**
 * The webhook as a backup for the checkout pixel (SHO-88).
 *
 * PostHog only merges two events when their id, name, `distinct_id` and
 * `timestamp` all match, and the pixel can't know the order's `created_at`.
 * So the two senders can't both send `order_completed`: one has to win.
 *
 * The pixel wins when it runs, because its event says more (subscription
 * lines, the browser session). After PostHog accepts it, it tells this Worker
 * "order X was counted". The webhook doesn't send straight away: it hands the
 * event to this object, one per order, which waits BACKUP_DELAY_MS and sends
 * it only if no such note arrived. Order of arrival doesn't matter; a note
 * that comes first is remembered.
 *
 * ⚠️ The note is unauthenticated (the pixel holds no secret). Faking one only
 * stops the backup for an order whose id the caller knows: an analytics gap,
 * never a wrong number. It's rate-limited per IP like the subscribe endpoint.
 */

/** Long enough for a thank-you page to load and the pixel to report. */
export const BACKUP_DELAY_MS = 10 * 60 * 1000;

/** Past Shopify's 48 hours of webhook retries, then the object is emptied. */
export const FORGET_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A failed send is retried by this object, not by throwing: Cloudflare's own
 * alarm retries give up after about two minutes, and an outage can be longer.
 * Backoff doubles from a minute to an hour, for about two days in all.
 */
export const RETRY_FIRST_MS = 60 * 1000;
export const RETRY_MAX_MS = 60 * 60 * 1000;
export const MAX_SEND_ATTEMPTS = 54;

export class OrderBackup extends DurableObject {
  /** The pixel's note: this order's event reached PostHog. */
  async counted(): Promise<void> {
    await this.ctx.storage.delete("event");
    await this.ctx.storage.put("counted", true);
    await this.ctx.storage.setAlarm(Date.now() + FORGET_AFTER_MS);
  }

  /** The webhook's event, sent later unless the pixel reports first. */
  async schedule(event: CapturedOrderEvent): Promise<"counted" | "scheduled"> {
    if (await this.ctx.storage.get<boolean>("counted")) return "counted";
    // A retried webhook keeps the first event and its timer.
    if (!(await this.ctx.storage.get("event"))) {
      await this.ctx.storage.put("event", event);
      await this.ctx.storage.setAlarm(Date.now() + BACKUP_DELAY_MS);
    }
    return "scheduled";
  }

  /**
   * Sends the backup if it's still owed, then forgets the order. A failed send
   * sets the next attempt itself; after MAX_SEND_ATTEMPTS the event is dropped,
   * an analytics gap rather than an alarm that never stops.
   */
  override async alarm(): Promise<void> {
    const event = await this.ctx.storage.get<CapturedOrderEvent>("event");
    const counted = await this.ctx.storage.get<boolean>("counted");
    if (event && !counted) {
      const sent = await fetch(POSTHOG_CAPTURE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }).then(
        (response) => response.ok,
        () => false,
      );
      if (!sent) {
        const attempts = ((await this.ctx.storage.get<number>("attempts")) ?? 0) + 1;
        if (attempts < MAX_SEND_ATTEMPTS) {
          await this.ctx.storage.put("attempts", attempts);
          const delay = Math.min(RETRY_FIRST_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
          await this.ctx.storage.setAlarm(Date.now() + delay);
          return;
        }
        // The status only, never the event: it carries the visitor's id.
        console.warn(`Order backup dropped after ${attempts} failed sends`);
      }
    }
    await this.ctx.storage.deleteAll();
  }
}

export interface OrderCountedEnv {
  readonly ORDER_BACKUP: DurableObjectNamespace<OrderBackup>;
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

/** An order id is a number; anything longer than this isn't one. */
const MAX_COUNTED_BYTES = 32;

/**
 * `POST /orders/counted` from the pixel, body: the numeric order id as plain
 * text. Plain text so the pixel can send it without a CORS preflight. The
 * pixel reads only the status, and retries anything but a 2xx.
 */
export const handleOrderCounted = async (
  request: Request,
  env: OrderCountedEnv,
): Promise<Response> => {
  // Readable from any origin: the pixel runs in Shopify's sandbox and checks
  // the status to retry. A status is all there is to read.
  const status = (code: number) =>
    new Response(null, {
      status: code,
      headers: { "cache-control": "no-store", "access-control-allow-origin": "*" },
    });

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName(`counted:${ip}`),
  ).limit();
  if (!success) return status(429);

  const body = await readBounded(request, MAX_COUNTED_BYTES);
  if (body === null) return status(413);
  const orderId = body.trim();
  if (!/^\d{1,20}$/.test(orderId)) return status(400);

  await env.ORDER_BACKUP.get(env.ORDER_BACKUP.idFromName(orderId)).counted();
  return status(204);
};

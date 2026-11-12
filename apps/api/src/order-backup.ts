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
 * lines, the browser session, the person, all under the shopper's consent;
 * the webhook's is anonymous). After PostHog accepts it, it tells this Worker
 * "order X was counted". The webhook doesn't send straight away: it hands the
 * event to this object, one per order, which waits BACKUP_DELAY_MS and sends
 * it only if no such note arrived. Order of arrival doesn't matter; a note
 * that comes first is remembered.
 *
 * ⚠️ The note is unauthenticated (the pixel holds no secret), so it carries the
 * order's checkout token as well as its id, and stops the backup only when
 * the token matches the webhook's `checkout_token`. Order ids are close to
 * sequential and easy to guess; the token isn't. A note with the wrong token
 * changes nothing. It's rate-limited per IP like the subscribe endpoint.
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

/** Each note is kept under its own token, so a wrong one can't hide the right one. */
const noteKey = (checkoutToken: string) => `counted:${checkoutToken}`;

export class OrderBackup extends DurableObject {
  /**
   * The pixel's note: this order's event reached PostHog. It stops the backup
   * only if its checkout token matches the webhook's, whichever comes first.
   */
  async counted(checkoutToken: string): Promise<void> {
    await this.ctx.storage.put(noteKey(checkoutToken), true);
    const pending = await this.ctx.storage.get<string | null>("token");
    if (await this.ctx.storage.get("event")) {
      // A pending backup keeps its timer unless this note is the real one.
      if (pending !== checkoutToken) return;
      await this.ctx.storage.delete("event");
      await this.ctx.storage.setAlarm(Date.now() + FORGET_AFTER_MS);
      return;
    }
    // Only the first note sets the timer: repeated notes, right or wrong,
    // can't keep an order's state past three days.
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + FORGET_AFTER_MS);
  }

  /**
   * The webhook's event, sent later unless the pixel reports first. An order
   * without a checkout token (made in the admin, say) has no pixel to wait for,
   * and is sent after the same delay.
   */
  async schedule(
    event: CapturedOrderEvent,
    checkoutToken: string | null,
  ): Promise<"counted" | "scheduled"> {
    if (checkoutToken && (await this.ctx.storage.get<boolean>(noteKey(checkoutToken))))
      return "counted";
    // A retried webhook keeps the first event and its timer.
    if (!(await this.ctx.storage.get("event"))) {
      // The alarm first, then the event and token in one write: a failure
      // part-way leaves either nothing stored (the retry starts over) or an
      // alarm with nothing to send, never an event without an alarm.
      await this.ctx.storage.setAlarm(Date.now() + BACKUP_DELAY_MS);
      await this.ctx.storage.put({ event, token: checkoutToken });
    }
    return "scheduled";
  }

  /**
   * Sends the backup if it's still owed, then forgets the order. A failed send
   * sets the next attempt itself; after MAX_SEND_ATTEMPTS the event is dropped,
   * an analytics gap rather than an alarm that never stops.
   */
  override async alarm(): Promise<void> {
    // counted() deletes the event when the right note arrives, so an event
    // still here is owed.
    const event = await this.ctx.storage.get<CapturedOrderEvent>("event");
    if (event) {
      const sent = await fetch(POSTHOG_CAPTURE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }).then(
        (response) => response.ok,
        () => false,
      );
      // The pixel's note may have arrived during the send and cancelled it.
      // It has set its own three-day timer; don't replace it.
      if (!sent && !(await this.ctx.storage.get("event"))) return;
      if (!sent) {
        const attempts = ((await this.ctx.storage.get<number>("attempts")) ?? 0) + 1;
        if (attempts < MAX_SEND_ATTEMPTS) {
          await this.ctx.storage.put("attempts", attempts);
          const delay = Math.min(RETRY_FIRST_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
          await this.ctx.storage.setAlarm(Date.now() + delay);
          return;
        }
        // The status only: an outcome is enough to diagnose with.
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

/** An order id and a checkout token; anything longer isn't one. */
const MAX_COUNTED_BYTES = 256;

/** The numeric order id, a newline, then the checkout token. */
const COUNTED_BODY = /^(\d{1,20})\n([\x21-\x7e]{1,200})$/;

/**
 * `POST /orders/counted` from the pixel, body: the numeric order id and the
 * checkout token, on two lines of plain text. Plain text so the pixel can send
 * it without a CORS preflight. The pixel reads only the status, and retries
 * anything but a 2xx.
 */
export const handleOrderCounted = async (
  request: Request,
  env: OrderCountedEnv,
): Promise<Response> => {
  // ⚠️ The one route with a CORS header, an exception to this Worker's rule
  // (apps/api/AGENTS.md, ADR 0012). The pixel runs in Shopify's sandbox, whose origin we
  // don't control, and needs the status to know whether to retry. A status is
  // all there is to read, and the route can only stop a backup, never send.
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
  const match = COUNTED_BODY.exec(body.trim());
  if (!match) return status(400);
  const [, orderId = "", checkoutToken = ""] = match;

  await env.ORDER_BACKUP.get(env.ORDER_BACKUP.idFromName(orderId)).counted(checkoutToken);
  return status(204);
};

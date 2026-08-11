import { DurableObject } from "cloudflare:workers";

import { decide, type WindowState } from "./rate-limit-policy";

/**
 * A rate limiter that actually enforces.
 *
 * ⚠️ This replaces Cloudflare's `ratelimits` binding, which **did not work**.
 * That binding deployed cleanly, appeared in the deploy output as
 * `env.SUBSCRIBE_LIMITER (5 requests/60s)`, and returned `{"success":true}` to
 * every call — verified across 30+ requests against a limit of 5/60s, in
 * parallel bursts and sequential runs minutes apart.
 *
 * Cloudflare's own documentation explains why: that API is *"permissive,
 * eventually consistent, and intentionally designed to not be used as an
 * accurate accounting system"*, with counters cached per-location and updated
 * asynchronously. A rate limiter **is** an accounting system, so it was the
 * wrong primitive — a sentence in the docs said so, and it took measuring the
 * behaviour to notice.
 *
 * A Durable Object is the right one because it is **single-threaded and
 * serialised**: only one request executes against a given object at a time, so
 * the read-modify-write below cannot interleave. Strong consistency is the
 * execution model, not a setting.
 *
 * One object per IP, addressed by `idFromName(ip)`. The rule itself lives in
 * ./rate-limit-policy so it can be tested without a runtime.
 */
export class RateLimiter extends DurableObject {
  async limit(): Promise<{ readonly success: boolean }> {
    const state = (await this.ctx.storage.get<WindowState>("window")) ?? null;
    const { allowed, next } = decide(state, Date.now());

    if (next) await this.ctx.storage.put("window", next);

    return { success: allowed };
  }
}

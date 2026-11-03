/**
 * The rate limiting decision, as a pure function.
 *
 * Separated from the Durable Object deliberately. The DO supplies storage and
 * serialised execution; this decides. Keeping them apart means the rule can be
 * tested exhaustively without a `workerd` harness, and the class that wraps it
 * has almost nothing left to get wrong.
 */

/** Requests permitted per window, per IP. */
export const LIMIT = 5;

/** Window length. Well above human form-filling, well below useful abuse. */
export const WINDOW_MS = 60_000;

export interface WindowState {
  readonly windowStart: number;
  readonly count: number;
}

export interface Decision {
  readonly allowed: boolean;
  /** The state to persist. Absent when nothing changed — i.e. when blocking. */
  readonly next?: WindowState;
}

/**
 * A **fixed** window, not sliding.
 *
 * The honest trade: a caller can send `LIMIT` at the end of one window and
 * `LIMIT` at the start of the next, so the true worst case is 2× across a
 * boundary. A sliding window needs a timestamp per request rather than a
 * counter, and for "stop someone hammering a signup form" that extra state
 * is not worth it.
 */
/**
 * The signed-in routes (/account/…) are called from web's *server*, so every
 * web customer shares Vercel's IP. They get a looser per-IP backstop, and the
 * real limit per customer, keyed by the id Shopify verified (SHO-73).
 */
export const ACCOUNT_IP_LIMIT = 120;
export const CUSTOMER_LIMIT = 30;

export const decide = (
  state: WindowState | null,
  now: number,
  limit: number = LIMIT,
): Decision => {
  if (state === null || now - state.windowStart >= WINDOW_MS) {
    return { allowed: true, next: { windowStart: now, count: 1 } };
  }

  if (state.count >= limit) return { allowed: false };

  return { allowed: true, next: { ...state, count: state.count + 1 } };
};

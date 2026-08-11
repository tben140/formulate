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
export const decide = (state: WindowState | null, now: number): Decision => {
  if (state === null || now - state.windowStart >= WINDOW_MS) {
    return { allowed: true, next: { windowStart: now, count: 1 } };
  }

  if (state.count >= LIMIT) return { allowed: false };

  return { allowed: true, next: { ...state, count: state.count + 1 } };
};

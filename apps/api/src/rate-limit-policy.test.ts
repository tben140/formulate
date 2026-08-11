import { describe, expect, it } from "vitest";

import { LIMIT, WINDOW_MS, decide } from "./rate-limit-policy";

/**
 * ⚠️ These are the tests the previous limiter never had.
 *
 * Cloudflare's `ratelimits` binding passed every check short of counting
 * responses — it deployed, appeared in the bindings list, and returned a
 * well-formed `{ success: true }` forever. Asserting on a mock's return value
 * would have "passed" against it too.
 *
 * So these assert the *rule*: what happens on the sixth request, at the window
 * boundary, and on a fresh key.
 */

const at = (windowStart: number, count: number) => ({ windowStart, count });

describe("decide", () => {
  it("allows the first request from an unseen key", () => {
    expect(decide(null, 1_000)).toEqual({
      allowed: true,
      next: { windowStart: 1_000, count: 1 },
    });
  });

  it("allows exactly LIMIT requests, then blocks", () => {
    let state = decide(null, 0).next!;
    for (let i = 2; i <= LIMIT; i++) {
      const result = decide(state, 0);
      expect(result.allowed, `request ${i}`).toBe(true);
      state = result.next!;
    }

    // The (LIMIT + 1)th.
    expect(decide(state, 0)).toEqual({ allowed: false });
  });

  it("does not advance the counter while blocking", () => {
    // Otherwise a caller who keeps hammering pushes the count arbitrarily high
    // and stays blocked past the window they should have been released in.
    const blocked = decide(at(0, LIMIT), 0);
    expect(blocked.next).toBeUndefined();
  });

  it("starts a fresh window once the period has elapsed", () => {
    expect(decide(at(0, LIMIT), WINDOW_MS)).toEqual({
      allowed: true,
      next: { windowStart: WINDOW_MS, count: 1 },
    });
  });

  it("still blocks one millisecond before the window closes", () => {
    expect(decide(at(0, LIMIT), WINDOW_MS - 1)).toEqual({ allowed: false });
  });

  it("permits 2x LIMIT across a boundary — the fixed-window trade, asserted", () => {
    /*
     * Not a bug, a documented consequence. Pinning it means the trade stays a
     * decision rather than becoming a surprise: LIMIT at the end of one window
     * and LIMIT at the start of the next.
     */
    expect(decide(at(1, LIMIT - 1), WINDOW_MS - 1).allowed).toBe(true);
    expect(decide(at(WINDOW_MS, 0), WINDOW_MS).allowed).toBe(true);
  });
});

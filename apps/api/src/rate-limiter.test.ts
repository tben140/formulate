import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIMIT, WINDOW_MS } from "./rate-limit-policy";
import { RateLimiter } from "./rate-limiter";

/**
 * The Durable Object's wiring: that `limit()` reads the stored window, applies
 * the policy and writes the next window back. The rule itself is covered in
 * rate-limit-policy.test.ts. Storage is an in-memory map standing in for the
 * object's own storage, which is per object, so per IP.
 */
const limiter = () => {
  const store = new Map<string, unknown>();
  const storage = {
    get: (key: string) => Promise.resolve(store.get(key)),
    put: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
  return new RateLimiter({ storage } as unknown as DurableObjectState, {});
};

const calls = async (object: RateLimiter, count: number) => {
  const results: boolean[] = [];
  for (let i = 0; i < count; i++) results.push((await object.limit()).success);
  return results;
};

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`allows ${LIMIT} calls in a window, then refuses`, async () => {
    const results = await calls(limiter(), LIMIT + 2);
    expect(results).toEqual([...Array<boolean>(LIMIT).fill(true), false, false]);
  });

  it("keeps the count between calls, in its own storage", async () => {
    const object = limiter();
    await calls(object, LIMIT);
    // A fresh object (another IP) starts from nothing.
    expect((await limiter().limit()).success).toBe(true);
    expect((await object.limit()).success).toBe(false);
  });

  it("allows calls again once the window has passed", async () => {
    const object = limiter();
    await calls(object, LIMIT + 1);
    vi.advanceTimersByTime(WINDOW_MS);
    expect((await object.limit()).success).toBe(true);
  });
});

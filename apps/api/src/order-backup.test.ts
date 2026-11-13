import type { CapturedOrderEvent } from "@formulate/analytics";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";
import {
  BACKUP_DELAY_MS,
  FORGET_AFTER_MS,
  MAX_SEND_ATTEMPTS,
  OrderBackup,
  RETRY_FIRST_MS,
  RETRY_MAX_MS,
} from "./order-backup";

/** Durable Object storage as a Map, with its one alarm. */
const fakeState = () => {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const storage = {
    get: (key: string) => Promise.resolve(data.get(key)),
    put: (key: string | Record<string, unknown>, value?: unknown) => {
      if (typeof key === "string") data.set(key, value);
      else for (const [k, v] of Object.entries(key)) data.set(k, v);
      return Promise.resolve();
    },
    delete: (key: string) => Promise.resolve(data.delete(key)),
    deleteAll: () => {
      data.clear();
      alarm = null;
      return Promise.resolve();
    },
    setAlarm: (time: number) => Promise.resolve(void (alarm = time)),
    getAlarm: () => Promise.resolve(alarm),
  };
  return { ctx: { storage }, data, alarm: () => alarm };
};

const object = () => {
  const state = fakeState();
  // A stand-in for the runtime's DurableObjectState.
  const ctx = state.ctx as unknown as ConstructorParameters<typeof OrderBackup>[0];
  return { backup: new OrderBackup(ctx, {}), ...state };
};

const event: CapturedOrderEvent = {
  api_key: "phc_test",
  event: "order_completed",
  uuid: "00000000-0000-8000-8000-000000000000",
  distinct_id: "00000000-0000-8000-8000-000000000000",
  timestamp: "2026-10-28T19:40:00.000Z",
  properties: { order_value: 39.85, $process_person_profile: false },
};

const TOKEN = "checkout-token-1";

const now = Date.parse("2026-10-29T12:00:00Z");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OrderBackup", () => {
  it("sends the webhook's event after the delay when the pixel never reports", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const { backup, alarm, data } = object();

    expect(await backup.schedule(event, TOKEN)).toBe("scheduled");
    expect(alarm()).toBe(now + BACKUP_DELAY_MS);
    await backup.alarm();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string; signal?: unknown },
    ];
    expect(JSON.parse(init.body)).toEqual(event);
    // A stalled PostHog can't hold the alarm: the send has a deadline.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(data.size).toBe(0);
  });

  it("sends nothing when the pixel reports after the webhook", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { backup } = object();
    await backup.schedule(event, TOKEN);
    await backup.counted(TOKEN);
    await backup.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the pixel reports first, and remembers it for days", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { backup, alarm } = object();
    await backup.counted(TOKEN);
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
    expect(await backup.schedule(event, TOKEN)).toBe("counted");
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
    await backup.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a note whose checkout token isn't the order's, before or after", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const { backup, alarm } = object();
    await backup.counted("guessed");
    expect(await backup.schedule(event, TOKEN)).toBe("scheduled");
    await backup.counted("guessed-again");
    expect(alarm()).toBe(now + BACKUP_DELAY_MS);
    await backup.alarm();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("still honours the real note after a wrong one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { backup } = object();
    await backup.schedule(event, TOKEN);
    await backup.counted("guessed");
    await backup.counted(TOKEN);
    await backup.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("doesn't let repeated notes keep an order's state past three days", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { backup, alarm } = object();
    await backup.counted("guessed");
    vi.setSystemTime(now + 2 * 24 * 60 * 60 * 1000);
    await backup.counted("guessed-again");
    await backup.counted(TOKEN);
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
  });

  it("keeps the note's timer when the note cancels a send that then fails", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { backup, alarm, data } = object();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await backup.counted(TOKEN);
        return new Response("", { status: 503 });
      }),
    );
    await backup.schedule(event, TOKEN);
    await backup.alarm();
    expect(data.get("event")).toBeUndefined();
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
  });

  it("never stores an event without its alarm", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { backup, alarm, data, ctx } = object();
    const put = vi.spyOn(ctx.storage, "put").mockRejectedValueOnce(new Error("storage"));
    await expect(backup.schedule(event, TOKEN)).rejects.toThrow("storage");
    expect(data.get("event")).toBeUndefined();
    put.mockRestore();
    // Shopify's retry stores it, with the alarm.
    await backup.schedule(event, TOKEN);
    expect(data.get("event")).toEqual(event);
    expect(alarm()).toBe(now + BACKUP_DELAY_MS);
  });

  it("sends an order with no checkout token (an admin order) after the delay", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const { backup } = object();
    expect(await backup.schedule(event, null)).toBe("scheduled");
    await backup.alarm();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the first event and its timer when Shopify retries", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { backup, alarm, data } = object();
    await backup.schedule(event, TOKEN);
    vi.setSystemTime(now + 60_000);
    await backup.schedule({ ...event, timestamp: "changed" }, TOKEN);
    expect(alarm()).toBe(now + BACKUP_DELAY_MS);
    expect(data.get("event")).toEqual(event);
  });

  it("retries a failed send itself, backing off to an hour", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 503 }))),
    );
    const { backup, data, alarm } = object();
    await backup.schedule(event, TOKEN);
    await backup.alarm();
    expect(alarm()).toBe(now + RETRY_FIRST_MS);
    await backup.alarm();
    expect(alarm()).toBe(now + 2 * RETRY_FIRST_MS);
    for (let i = 0; i < 10; i++) await backup.alarm();
    expect(alarm()).toBe(now + RETRY_MAX_MS);
    expect(data.get("event")).toEqual(event);
  });

  it("retries after a network failure too", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("fetch failed"))),
    );
    const { backup, alarm } = object();
    await backup.schedule(event, TOKEN);
    await expect(backup.alarm()).resolves.toBeUndefined();
    expect(alarm()).toBe(now + RETRY_FIRST_MS);
  });

  it("gives up after the last attempt and forgets the order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 503 }))),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { backup, data } = object();
    await backup.schedule(event, TOKEN);
    for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) await backup.alarm();
    expect(data.size).toBe(0);
  });
});

describe("POST /orders/counted", () => {
  const counted = vi.fn(() => Promise.resolve());
  const limit = vi.fn(() => Promise.resolve({ success: true }));
  const env = {
    KLAVIYO_PRIVATE_KEY: "pk",
    KLAVIYO_LIST_ID: "list",
    RATE_LIMITER: { idFromName: (name: string) => name, get: () => ({ limit }) },
    ORDER_BACKUP: { idFromName: (name: string) => name, get: () => ({ counted }) },
  };
  const post = (body: string) =>
    worker.fetch(
      new Request("https://api.example/orders/counted", {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "CF-Connecting-IP": "1.2.3.4",
        },
        body,
      }),
      // The stubs stand in for Cloudflare's bindings.
      env as unknown as Parameters<typeof worker.fetch>[1],
    );

  afterEach(() => {
    counted.mockClear();
    limit.mockClear();
  });

  it("marks the order counted, passing on the checkout token", async () => {
    const response = await post("6500000000001\ncheckout-token-1");
    expect(response.status).toBe(204);
    expect(counted).toHaveBeenCalledWith("checkout-token-1");
  });

  it("refuses anything that isn't an order id and a token", async () => {
    expect((await post("6500000000001")).status).toBe(400);
    expect((await post("gid://shopify/Order/1\ncheckout-token-1")).status).toBe(400);
    expect((await post("6500000000001\nhas a space")).status).toBe(400);
    expect((await post("1".repeat(300))).status).toBe(413);
    expect(counted).not.toHaveBeenCalled();
  });

  it("is rate-limited per IP", async () => {
    limit.mockResolvedValueOnce({ success: false });
    expect((await post("6500000000001\ncheckout-token-1")).status).toBe(429);
    expect(counted).not.toHaveBeenCalled();
  });
});

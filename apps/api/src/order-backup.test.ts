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
    put: (key: string, value: unknown) => Promise.resolve(void data.set(key, value)),
    delete: (key: string) => Promise.resolve(data.delete(key)),
    deleteAll: () => {
      data.clear();
      alarm = null;
      return Promise.resolve();
    },
    setAlarm: (time: number) => Promise.resolve(void (alarm = time)),
  };
  return { ctx: { storage }, data, alarm: () => alarm };
};

const object = () => {
  const state = fakeState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in for the runtime's DurableObjectState
  return { backup: new OrderBackup(state.ctx as any, {}), ...state };
};

const event: CapturedOrderEvent = {
  api_key: "phc_test",
  event: "order_completed",
  uuid: "00000000-0000-8000-8000-000000000000",
  distinct_id: "web-visitor-id",
  timestamp: "2026-10-28T19:40:00.000Z",
  properties: { order_id: "6500000000001" },
};

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

    expect(await backup.schedule(event)).toBe("scheduled");
    expect(alarm()).toBe(now + BACKUP_DELAY_MS);
    await backup.alarm();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual(event);
    expect(data.size).toBe(0);
  });

  it("sends nothing when the pixel reports after the webhook", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { backup } = object();
    await backup.schedule(event);
    await backup.counted();
    await backup.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the pixel reports first, and remembers it for days", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { backup, alarm } = object();
    await backup.counted();
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
    expect(await backup.schedule(event)).toBe("counted");
    expect(alarm()).toBe(now + FORGET_AFTER_MS);
    await backup.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the first event and its timer when Shopify retries", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { backup, alarm, data } = object();
    await backup.schedule(event);
    vi.setSystemTime(now + 60_000);
    await backup.schedule({ ...event, timestamp: "changed" });
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
    await backup.schedule(event);
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
    await backup.schedule(event);
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
    await backup.schedule(event);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the stubs stand in for Cloudflare bindings
      env as any,
    );

  afterEach(() => {
    counted.mockClear();
    limit.mockClear();
  });

  it("marks the order counted", async () => {
    const response = await post("6500000000001");
    expect(response.status).toBe(204);
    expect(counted).toHaveBeenCalledOnce();
  });

  it("refuses anything that isn't an order id", async () => {
    expect((await post("gid://shopify/Order/1")).status).toBe(400);
    expect((await post("1".repeat(40))).status).toBe(413);
    expect(counted).not.toHaveBeenCalled();
  });

  it("is rate-limited per IP", async () => {
    limit.mockResolvedValueOnce({ success: false });
    expect((await post("6500000000001")).status).toBe(429);
    expect(counted).not.toHaveBeenCalled();
  });
});

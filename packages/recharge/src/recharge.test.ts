import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSubscription,
  isSessionExpiring,
  listSubscriptions,
  listUpcomingCharges,
  loginWithCustomerAccount,
  type RechargeCharge,
  type RechargeConfig,
  type RechargeSession,
  type RechargeSubscription,
} from "./client";
import {
  chargeDelivery,
  chargesForSubscription,
  chargeTotal,
  deliveryFrequency,
  deliveryPrice,
  formatDeliveryDate,
  sortSubscriptions,
  subscriptionStatusLabel,
} from "./display";
import { QUEUED_CHARGE_FIXTURE, SUBSCRIPTION_FIXTURE } from "./fixtures";

const CONFIG: RechargeConfig = {
  storeDomain: "shop.example.myshopify.com",
  storefrontToken: "strfnt_test",
};
const NOW = Date.UTC(2026, 9, 6, 12);
const SESSION: RechargeSession = {
  apiToken: "rc_session",
  customerId: "42",
  expiresAt: NOW + 1000,
};

const subscription = SUBSCRIPTION_FIXTURE as unknown as RechargeSubscription;
const charge = QUEUED_CHARGE_FIXTURE as unknown as RechargeCharge;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loginWithCustomerAccount", () => {
  it("posts the customer token as the SDK does, and returns an hour-long session", async () => {
    const fetchMock = vi.fn(async () =>
      json({ api_token: "rc_session", customer_id: 42 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginWithCustomerAccount(CONFIG, "shcat_customer", NOW);

    expect(result).toEqual({
      ok: true,
      data: { apiToken: "rc_session", customerId: "42", expiresAt: NOW + 55 * 60 * 1000 },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://admin.rechargeapps.com/shopify_customer_account_api_access",
    );
    expect(init.headers).toMatchObject({
      "X-Recharge-Storefront-Access-Token": "strfnt_test",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      customer_token: "shcat_customer",
      shop_url: "shop.example.myshopify.com",
    });
  });

  it("treats a customer Recharge doesn't know as no session, not an error", async () => {
    // Someone with a Shopify account who has never subscribed.
    vi.stubGlobal("fetch", async () =>
      json({ api_token: null, message: "Customer not found" }),
    );
    expect(await loginWithCustomerAccount(CONFIG, "shcat_customer", NOW)).toEqual({
      ok: true,
      data: null,
    });
  });

  it("reports a refused login as HTTP 401, not as an expired session", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "bad token" }, 401));
    expect(await loginWithCustomerAccount(CONFIG, "x", NOW)).toMatchObject({
      ok: false,
      error: { kind: "http", status: 401 },
    });
  });

  it("refuses to run without a Storefront token", async () => {
    expect(
      await loginWithCustomerAccount({ ...CONFIG, storefrontToken: "" }, "x", NOW),
    ).toMatchObject({ ok: false, error: { kind: "config" } });
  });
});

describe("reads", () => {
  it("lists subscriptions with the session token, API version and shop_url", async () => {
    const fetchMock = vi.fn(async () => json({ subscriptions: [SUBSCRIPTION_FIXTURE] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listSubscriptions(CONFIG, SESSION);

    expect(result.ok && result.data[0]?.product_title).toBe("Daily Multivitamin");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.rechargeapps.com/subscriptions?limit=50&shop_url=shop.example.myshopify.com",
    );
    expect(init.headers).toMatchObject({
      "X-Recharge-Access-Token": "rc_session",
      "X-Recharge-Version": "2021-11",
    });
  });

  it("asks for queued charges, soonest first", async () => {
    const fetchMock = vi.fn(async () => json({ charges: [QUEUED_CHARGE_FIXTURE] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listUpcomingCharges(CONFIG, SESSION);

    expect(result.ok && result.data[0]?.total_price).toBe("17.51");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("status")).toBe("queued");
    expect(new URL(url).searchParams.get("sort_by")).toBe("scheduled_at-asc");
  });

  it("maps 401 to an expired session and 429 to rate limiting", async () => {
    vi.stubGlobal("fetch", async () => json({}, 401));
    expect(await listSubscriptions(CONFIG, SESSION)).toMatchObject({
      ok: false,
      error: { kind: "session-expired" },
    });
    vi.stubGlobal("fetch", async () => json({}, 429));
    expect(await listSubscriptions(CONFIG, SESSION)).toMatchObject({
      ok: false,
      error: { kind: "rate-limited" },
    });
  });

  it("returns null for another customer's subscription, and never sends a crafted id", async () => {
    vi.stubGlobal("fetch", async () => json({ errors: "Not found" }, 404));
    expect(await getSubscription(CONFIG, SESSION, "891037192")).toEqual({
      ok: true,
      data: null,
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getSubscription(CONFIG, SESSION, "1/../customers")).toEqual({
      ok: true,
      data: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("knows when a session has run out", () => {
    expect(isSessionExpiring(SESSION, NOW)).toBe(false);
    expect(isSessionExpiring(SESSION, NOW + 1000)).toBe(true);
  });
});

describe("display", () => {
  it("words the delivery schedule", () => {
    expect(deliveryFrequency(subscription)).toBe("Every 30 days");
    expect(
      deliveryFrequency({ order_interval_frequency: "1", order_interval_unit: "week" }),
    ).toBe("Every week");
    expect(
      deliveryFrequency({ order_interval_frequency: 2, order_interval_unit: "months" }),
    ).toBe("Every 2 months");
  });

  it("formats a bare Recharge date without shifting it a day", () => {
    expect(formatDeliveryDate("2026-11-05")).toBe("5 November 2026");
    // A timestamp late in the day still names its own date.
    expect(formatDeliveryDate("2026-11-05T23:30:00-05:00")).toBe("5 November 2026");
    expect(formatDeliveryDate(null)).toBeNull();
  });

  it("prices a delivery and reads a charge's totals", () => {
    expect(deliveryPrice(subscription)).toEqual({ amount: "13.56", currencyCode: "GBP" });
    expect(deliveryPrice({ ...subscription, quantity: 2 })).toEqual({
      amount: "27.12",
      currencyCode: "GBP",
    });
    expect(chargeTotal(charge)).toEqual({ amount: "17.51", currencyCode: "GBP" });
    expect(chargeDelivery(charge)).toEqual({ amount: "3.95", currencyCode: "GBP" });
  });

  it("matches charges to their subscription", () => {
    expect(chargesForSubscription([charge], subscription.id)).toHaveLength(1);
    expect(chargesForSubscription([charge], 1)).toHaveLength(0);
  });

  it("puts active subscriptions first, soonest delivery first", () => {
    const cancelled = {
      ...subscription,
      id: 1,
      status: "cancelled",
      next_charge_scheduled_at: null,
    };
    const later = { ...subscription, id: 2, next_charge_scheduled_at: "2026-12-01" };
    expect(sortSubscriptions([cancelled, later, subscription]).map((s) => s.id)).toEqual([
      subscription.id,
      2,
      1,
    ]);
  });

  it("labels statuses for shoppers", () => {
    expect(subscriptionStatusLabel("expired")).toBe("Finished");
    expect(subscriptionStatusLabel("active")).toBe("Active");
  });
});

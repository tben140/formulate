import { describe, expect, it } from "vitest";

import {
  DEFAULT_THRESHOLDS,
  parseThresholds,
  segmentCounts,
  segmentMembers,
  tagPlan,
  tagSyncProblem,
  type SegmentInputs,
} from "./segments";

const now = new Date("2026-11-04T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const gid = (n: number) => `gid://shopify/Customer/${n}`;

const inputs = (overrides: Partial<SegmentInputs> = {}): SegmentInputs => ({
  subscriptions: [],
  missed: [],
  customers: [],
  shopifyIdOf: new Map([1, 2, 3, 4, 5, 6].map((n) => [n, gid(n)])),
  ...overrides,
});

describe("parseThresholds", () => {
  it("uses the defaults when there's no record", () => {
    expect(parseThresholds(null)).toEqual({
      thresholds: DEFAULT_THRESHOLDS,
      problems: [],
    });
  });

  it("takes valid values and keeps the default for bad ones", () => {
    const { thresholds, problems } = parseThresholds(
      JSON.stringify({ lapsedMonths: 6, bestTopPercent: 80, colour: "red" }),
    );
    expect(thresholds.lapsedMonths).toBe(6);
    expect(thresholds.bestTopPercent).toBe(DEFAULT_THRESHOLDS.bestTopPercent);
    expect(problems).toEqual([
      "bestTopPercent: a whole number from 1 to 50",
      "colour: not a threshold",
    ]);
  });

  it("reports an inherited property name as not a threshold", () => {
    const { thresholds, problems } = parseThresholds(JSON.stringify({ constructor: 5 }));
    expect(thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(problems).toEqual(["constructor: not a threshold"]);
  });

  it("rejects a dormant window that ends before it starts", () => {
    const { thresholds, problems } = parseThresholds(
      JSON.stringify({ dormantFromDays: 200, dormantToDays: 100 }),
    );
    expect(thresholds.dormantFromDays).toBe(90);
    expect(thresholds.dormantToDays).toBe(180);
    expect(problems).toEqual(["dormantToDays must be after dormantFromDays"]);
  });

  it("reports text that isn't JSON", () => {
    expect(parseThresholds("{").problems).toEqual(["segment_thresholds isn't JSON"]);
  });
});

describe("segmentMembers", () => {
  it("splits Recharge customers into active, lapsed and at risk", () => {
    const { members } = segmentMembers(
      inputs({
        subscriptions: [
          { customerId: 1, status: "ACTIVE", createdAt: daysAgo(30), cancelledAt: null },
          {
            customerId: 2,
            status: "cancelled",
            createdAt: daysAgo(400),
            cancelledAt: daysAgo(60),
          },
          // Cancelled too long ago to count as lapsed.
          {
            customerId: 3,
            status: "cancelled",
            createdAt: daysAgo(900),
            cancelledAt: daysAgo(500),
          },
          // Cancelled one, still has another: active, not lapsed.
          {
            customerId: 4,
            status: "cancelled",
            createdAt: daysAgo(200),
            cancelledAt: daysAgo(20),
          },
          { customerId: 4, status: "active", createdAt: daysAgo(100), cancelledAt: null },
        ],
        missed: [
          { customerId: 1, scheduledAt: daysAgo(10) },
          { customerId: 1, scheduledAt: daysAgo(40) },
          // Outside the 90 days.
          { customerId: 4, scheduledAt: daysAgo(10) },
          { customerId: 4, scheduledAt: daysAgo(120) },
          // Missed twice but cancelled: lapsed, not at risk.
          { customerId: 2, scheduledAt: daysAgo(70) },
          { customerId: 2, scheduledAt: daysAgo(80) },
        ],
      }),
      DEFAULT_THRESHOLDS,
      now,
    );
    expect(members.active).toEqual([gid(1), gid(4)]);
    expect(members.lapsed).toEqual([gid(2)]);
    expect(members.at_risk).toEqual([gid(1)]);
  });

  it("finds one-time buyers, dormant buyers and the best customers", () => {
    const { members } = segmentMembers(
      inputs({
        subscriptions: [
          // Subscribed 13 months: best, whatever they've spent.
          { customerId: 1, status: "active", createdAt: daysAgo(400), cancelledAt: null },
          {
            customerId: 2,
            status: "cancelled",
            createdAt: daysAgo(300),
            cancelledAt: daysAgo(100),
          },
        ],
        customers: [
          { id: gid(1), orders: 13, amountSpent: 10, lastOrderAt: daysAgo(120) },
          { id: gid(2), orders: 3, amountSpent: 90, lastOrderAt: daysAgo(100) },
          { id: gid(7), orders: 1, amountSpent: 500, lastOrderAt: daysAgo(10) },
          { id: gid(8), orders: 2, amountSpent: 40, lastOrderAt: daysAgo(150) },
          { id: gid(9), orders: 0, amountSpent: 0, lastOrderAt: null },
          ...[10, 11, 12, 13, 14, 15, 16].map((n) => ({
            id: gid(n),
            orders: 1,
            amountSpent: 20,
            lastOrderAt: daysAgo(400),
          })),
        ],
      }),
      DEFAULT_THRESHOLDS,
      now,
    );
    // Never in Recharge, and ordered.
    expect(members.one_time).toEqual([7, 8, 10, 11, 12, 13, 14, 15, 16].map(gid).sort());
    // 90–180 days, not subscribed now (1 is, so 1 isn't dormant).
    expect(members.dormant).toEqual([gid(2), gid(8)]);
    // Top 10% of 11 spenders is 2: 7 (£500) and 2 (£90); plus 1, subscribed 13 months.
    expect(members.best).toEqual([gid(1), gid(2), gid(7)]);
  });

  it("counts Recharge customers it can't match to Shopify", () => {
    const segments = segmentMembers(
      inputs({
        subscriptions: [
          { customerId: 1, status: "active", createdAt: daysAgo(10), cancelledAt: null },
          { customerId: 99, status: "active", createdAt: daysAgo(10), cancelledAt: null },
        ],
      }),
      DEFAULT_THRESHOLDS,
      now,
    );
    expect(segments.members.active).toEqual([gid(1)]);
    expect(segments.unmatched).toBe(1);
  });

  it("follows the thresholds", () => {
    const { members } = segmentMembers(
      inputs({
        subscriptions: [
          {
            customerId: 2,
            status: "cancelled",
            createdAt: daysAgo(400),
            cancelledAt: daysAgo(250),
          },
        ],
      }),
      { ...DEFAULT_THRESHOLDS, lapsedMonths: 6 },
      now,
    );
    expect(members.lapsed).toEqual([]);
  });
});

describe("tagPlan", () => {
  it("adds new members and removes people who've left", () => {
    expect(tagPlan([gid(1), gid(2)], [gid(2), gid(3)])).toEqual({
      add: [gid(1)],
      remove: [gid(3)],
    });
  });
});

describe("tagSyncProblem", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => gid(i + 1));

  it("lets ordinary churn through", () => {
    expect(tagSyncProblem("lapsed", { add: ids(40), remove: ids(30) }, 100)).toBeNull();
    // Small segments can change wholesale.
    expect(tagSyncProblem("best", { add: [], remove: ids(3) }, 3)).toBeNull();
  });

  it("stops a sync that would strip most of a segment", () => {
    expect(tagSyncProblem("active", { add: [], remove: ids(60) }, 100)).toBe(
      "segment:active: would remove 60 of 100 tags",
    );
  });
});

describe("segmentCounts", () => {
  it("records each segment's size and when", () => {
    const counts = segmentCounts(segmentMembers(inputs(), DEFAULT_THRESHOLDS, now), now);
    expect(counts).toEqual({
      syncedAt: "2026-11-04T12:00:00.000Z",
      counts: { active: 0, lapsed: 0, at_risk: 0, one_time: 0, dormant: 0, best: 0 },
    });
  });
});

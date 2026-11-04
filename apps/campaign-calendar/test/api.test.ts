import { describe, expect, it } from "vitest";

import type { ReportOrder } from "@formulate/campaigns/report";

import { parseSegmentCounts, previewLinks, referralSummary } from "../src/api";

describe("previewLinks", () => {
  it("builds web and app links when the preview token is set", () => {
    expect(previewLinks("black-friday", "https://web.example", "x".repeat(24))).toEqual({
      web: `https://web.example/pages/campaigns/black-friday/preview?token=${"x".repeat(24)}`,
      app: `formulate://pages/campaigns/black-friday?preview=${"x".repeat(24)}`,
    });
  });

  it("gives none without a token, or with one too short to be the real one", () => {
    expect(previewLinks("bf", "https://web.example", undefined)).toEqual({
      web: null,
      app: null,
    });
    expect(previewLinks("bf", "https://web.example", "short")).toEqual({
      web: null,
      app: null,
    });
  });
});

describe("referralSummary", () => {
  const order = (name: string, customerId: string | null, discounts: string[]) =>
    ({ name, customerId, discounts }) as unknown as ReportOrder;

  it("counts referrers and the orders their codes brought, not self-referrals", () => {
    expect(
      referralSummary(
        [
          order("#1", "gid://shopify/Customer/2", ["REF-AAAA"]),
          order("#2", "gid://shopify/Customer/3", ["ref-aaaa"]),
          order("#3", "gid://shopify/Customer/1", ["REF-AAAA"]),
          order("#4", "gid://shopify/Customer/4", ["BF25"]),
        ],
        [
          { customerId: "gid://shopify/Customer/1", code: "REF-AAAA" },
          { customerId: "gid://shopify/Customer/5", code: null },
        ],
      ),
    ).toEqual({ referrers: 1, orders: 2 });
  });
});

describe("parseSegmentCounts", () => {
  it("reads the stored snapshot", () => {
    expect(
      parseSegmentCounts(
        JSON.stringify({
          syncedAt: "2026-11-04T15:50:00.000Z",
          counts: { lapsed: 3, best: 1 },
        }),
      ),
    ).toEqual({ syncedAt: "2026-11-04T15:50:00.000Z", counts: { lapsed: 3, best: 1 } });
  });

  it("drops anything that isn't a segment count", () => {
    expect(
      parseSegmentCounts(
        JSON.stringify({
          syncedAt: "x",
          counts: { lapsed: -1, "<b>": 2, best: 1.5, active: 4 },
        }),
      ),
    ).toEqual({ syncedAt: "x", counts: { active: 4 } });
  });

  it("is null when nothing has been stored", () => {
    expect(parseSegmentCounts(null)).toBeNull();
    expect(parseSegmentCounts("{")).toBeNull();
  });
});

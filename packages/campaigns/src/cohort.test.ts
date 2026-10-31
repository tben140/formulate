import { describe, expect, it } from "vitest";

import { cohort, cohortMarkdown } from "./cohort";
import type { ReportOrder } from "./report";

const campaign = {
  handle: "bf",
  discountTitles: ["BF (campaign)"],
  startsAt: new Date("2026-11-27T00:00:00Z"),
  endsAt: new Date("2026-12-01T00:00:00Z"),
};
const order = (
  customerId: string | null,
  createdAt: string,
  patch: Partial<ReportOrder> = {},
): ReportOrder => ({
  name: "#1",
  createdAt,
  subtotal: 20,
  currencyCode: "GBP",
  discounts: [],
  campaignDiscount: 0,
  attributes: {},
  sourceName: "web",
  utmSource: null,
  utmCampaign: null,
  customerOrders: 3,
  customerId,
  lines: [{ title: "Vitamin D3", quantity: 1, subscription: false }],
  ...patch,
});
const bf = { discounts: ["BF (campaign)"] };

describe("cohort", () => {
  const orders = [
    order("a", "2026-11-28T10:00:00Z", { ...bf, customerOrders: 1 }),
    order("b", "2026-11-29T10:00:00Z", bf),
    order("c", "2026-11-29T11:00:00Z", {
      ...bf,
      lines: [{ title: "Whey", quantity: 1, subscription: true }],
    }),
    order(null, "2026-11-30T10:00:00Z", bf),
    order("x", "2026-11-28T09:00:00Z"), // not a campaign order
    order("a", "2026-12-20T10:00:00Z"), // back within 30
    order("b", "2027-02-10T10:00:00Z", {
      lines: [{ title: "Whey", quantity: 1, subscription: true }],
    }), // back within 90, subscribed
    order("x", "2026-12-05T10:00:00Z"), // not a buyer
  ];
  const result = cohort(orders, campaign, new Date("2027-03-15T00:00:00Z"));

  it("follows signed-in campaign buyers, and counts guests apart", () => {
    expect(result).toMatchObject({ buyers: 3, guests: 1, firstTime: 1 });
  });

  it("counts who came back and subscribed in each window", () => {
    expect(result.windows).toEqual([
      { days: 30, returned: 1, subscribed: 1 },
      { days: 60, returned: 1, subscribed: 1 },
      { days: 90, returned: 2, subscribed: 2 },
    ]);
  });

  it("marks windows that haven't finished", () => {
    const early = cohort(orders, campaign, new Date("2026-12-21T00:00:00Z"));
    expect(cohortMarkdown("BF", early)).toContain("| 60 (so far) |");
  });
});

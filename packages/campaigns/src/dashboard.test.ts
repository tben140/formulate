import { describe, expect, it } from "vitest";

import { reportHtml } from "./dashboard";
import { campaignReport, type ReportOrder } from "./report";

const order = (patch: Partial<ReportOrder>): ReportOrder => ({
  name: "#1001",
  createdAt: "2026-11-27T09:15:00Z",
  subtotal: 22.39,
  currencyCode: "GBP",
  discounts: ["Black Friday 2026 (campaign)"],
  campaignDiscount: 7.46,
  attributes: {},
  sourceName: "web",
  utmSource: null,
  utmCampaign: null,
  firstOrder: true,
  lines: [{ title: "Vitamin D3", quantity: 3, subscription: false }],
  ...patch,
});

describe("the dashboard", () => {
  const campaign = {
    handle: "black-friday-2026",
    discountTitles: ["Black Friday 2026 (campaign)"],
  };

  it("counts orders by UK hour", () => {
    const report = campaignReport(
      [
        order({}),
        order({ name: "#1002", createdAt: "2026-11-27T09:50:00Z" }),
        order({ name: "#1003", createdAt: "2026-11-27T11:05:00Z" }),
      ],
      campaign,
    );
    expect(report.byHour).toEqual([
      { hour: "2026-11-27 09", orders: 2 },
      { hour: "2026-11-27 11", orders: 1 },
    ]);
  });

  it("renders the figures and escapes everything from the store", () => {
    const report = campaignReport(
      [
        order({
          lines: [{ title: '<img src=x onerror="1">', quantity: 1, subscription: false }],
        }),
      ],
      campaign,
    );
    const html = reportHtml(
      "Black Friday 2026",
      report,
      new Date("2026-11-27T10:00:00Z"),
    );
    expect(html).toContain("£22.39");
    expect(html).toContain("&#60;img src=x onerror=&#34;1&#34;&#62;");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script");
  });

  it("says none yet before any orders", () => {
    const html = reportHtml(
      "Black Friday 2026",
      campaignReport([], campaign),
      new Date(),
    );
    expect(html).toContain("None yet");
  });
});

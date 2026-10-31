import { describe, expect, it } from "vitest";

import { calendar } from "./calendar";
import { checkCampaign, percentsIn } from "./check";
import { plannedEmails, plannedPushes } from "./emails";
import blackFriday from "./fixtures/black-friday.json";
import { campaignReport, type ReportOrder } from "./report";
import { discountConfig, sameConfig } from "./sync";
import { templateFields } from "./templates";
import type { CampaignEntry, Finding, Snapshot } from "./types";

/** The live Black Friday campaign, read from the store on 30 October 2026. */
const live = blackFriday as unknown as Snapshot;
const BEFORE = new Date("2026-11-01T00:00:00Z");

const withFields = (
  fields: Record<string, string | null>,
  base: Snapshot = live,
): Snapshot => ({
  ...base,
  entry: { ...base.entry, fields: { ...base.entry.fields, ...fields } },
});
const errors = (findings: Finding[]) =>
  findings.filter((f) => f.level === "error").map((f) => f.message);
const warnings = (findings: Finding[]) =>
  findings.filter((f) => f.level === "warning").map((f) => f.message);

describe("checkCampaign on the live Black Friday campaign", () => {
  const findings = checkCampaign(live, BEFORE);

  it("finds nothing wrong with the offer, its wording or its discount", () => {
    expect(errors(findings)).toEqual([]);
  });

  it("allows the 15% subscribe-and-save mention in the body", () => {
    expect(findings.some((f) => f.message.includes("body"))).toBe(false);
  });

  it("warns that the perk is promised but not set up", () => {
    expect(warnings(findings)).toContain(
      "The subscriber perk is described but has no perk_variant, so campaigns perks can't add it.",
    );
  });

  it("has no Online Store warning when every product is published there", () => {
    expect(warnings(findings).some((w) => w.includes("Online Store"))).toBe(false);
  });

  it("warns about products that aren't on the Online Store", () => {
    const offStore = checkCampaign(
      {
        ...live,
        products: live.products.map((product, i) =>
          i === 0 ? { ...product, onOnlineStore: false } : product,
        ),
      },
      BEFORE,
    );
    expect(warnings(offStore)).toContain(
      "1 of 3 products aren't on the Online Store channel, so the theme won't show them: Vitamin D3.",
    );
  });

  it("doesn't mistake the seed CODE_DISCOUNT_BLACKFRIDAY for the campaign's", () => {
    expect(
      findings.find((f) => f.level === "ok" && f.message.startsWith("Discount"))?.message,
    ).toBe("Discount: Black Friday 2026: 25% off one-time orders.");
  });
});

describe("checkCampaign catches", () => {
  it("wording that disagrees with the offer", () => {
    const found = errors(
      checkCampaign(withFields({ banner_text: "Black Friday: 30% off" }), BEFORE),
    );
    expect(found).toEqual(["banner_text says 30%, but the offer gives 25%."]);
  });

  it("a discount that ends a day after the campaign", () => {
    const later = {
      ...live,
      discounts: live.discounts.map((d, i) =>
        i === 0 ? { ...d, endsAt: "2026-12-02T00:00:00Z" } : d,
      ),
    };
    expect(errors(checkCampaign(later, BEFORE))).toEqual([
      'Discount "Black Friday 2026: 25% off one-time orders" ends 2026-12-02T00:00:00Z, the campaign 2026-12-01T00:00:00.000Z.',
    ]);
  });

  it("a discount at a different percentage", () => {
    const wrong = { ...live, discounts: [{ ...live.discounts[0]!, percent: 20 }] };
    expect(errors(checkCampaign(wrong, BEFORE))).toEqual([
      'Discount "Black Friday 2026: 25% off one-time orders" gives 20%, the offer 25%.',
    ]);
  });

  it("no discount at all", () => {
    expect(errors(checkCampaign({ ...live, discounts: [] }, BEFORE))).toEqual([
      "No discount found for this campaign: nobody gets the offer at checkout.",
    ]);
  });

  it("an automatic discount on an email-only campaign", () => {
    expect(
      errors(checkCampaign(withFields({ audience: "email_link" }), BEFORE)),
    ).toContain(
      'Discount "Black Friday 2026: 25% off one-time orders" is automatic, so everyone gets the email-only offer.',
    );
  });

  it("rules that don't parse, and a plain discount for a tiered offer", () => {
    expect(errors(checkCampaign(withFields({ offer_rules: "25%" }), BEFORE))).toContain(
      "offer_rules doesn't parse: shoppers see no price, and the Function gives nothing.",
    );
    const tiered = withFields({
      offer_rules:
        '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":15},{"minSubtotal":"60","percent":25}]}',
    });
    expect(errors(checkCampaign(tiered, BEFORE))).toContain(
      'Discount "Black Friday 2026: 25% off one-time orders" is a plain percentage discount; a tiered offer needs the campaign Function.',
    );
  });

  it("a Function discount whose config has drifted from the record", () => {
    const expected = discountConfig(live.entry, live.collection, live.products);
    if (!("config" in expected)) throw new Error("no config");
    const app = {
      ...live.discounts[0]!,
      id: "gid://shopify/DiscountAutomaticNode/2",
      title: "Black Friday 2026 (campaign)",
      kind: "app" as const,
      percent: null,
      config: {
        ...expected.config,
        rules: { type: "percent", percent: 20, oneTimeOnly: true },
      },
    };
    expect(errors(checkCampaign({ ...live, discounts: [app] }, BEFORE))).toEqual([
      `Discount "Black Friday 2026 (campaign)"'s config is out of date: run campaigns sync black-friday-2026.`,
    ]);
    const synced = { ...app, config: JSON.parse(JSON.stringify(expected.config)) };
    expect(errors(checkCampaign({ ...live, discounts: [synced] }, BEFORE))).toEqual([]);
  });

  it("emails sent after the end, or saying another percentage", () => {
    const emails = [
      {
        id: "1",
        name: "Black Friday 2026: last day",
        status: "Draft",
        sendAt: "2026-12-01T09:00:00Z",
        text: "Last day",
      },
      {
        id: "2",
        name: "Black Friday 2026: launch",
        status: "Draft",
        sendAt: "2026-11-27T08:00:00Z",
        text: "30% off everything",
      },
    ];
    expect(errors(checkCampaign({ ...live, emails }, BEFORE))).toEqual([
      'Email "Black Friday 2026: last day" sends 2026-12-01T09:00:00Z, after the offer ends.',
      'Email "Black Friday 2026: launch" says 30%, but the offer gives 25%.',
    ]);
  });
});

describe("percentsIn", () => {
  it("finds percentages, with or without a space", () => {
    expect(percentsIn("Save 25% now, or 15 % on subscriptions; 100%")).toEqual([
      25, 15, 100,
    ]);
  });
});

describe("discountConfig", () => {
  it("is the collection alone when no product is narrowed", () => {
    expect(discountConfig(live.entry, live.collection, live.products)).toEqual({
      config: {
        campaign: "black-friday-2026",
        collectionIds: ["gid://shopify/Collection/524187107640"],
        variantIds: [],
        message: "Black Friday",
        rules: { type: "percent", percent: 25 },
        usedTags: [],
        audienceTags: [],
      },
    });
  });

  it("carries reach, limits and tags into the config", () => {
    const entry = {
      ...live.entry,
      fields: {
        ...live.entry.fields,
        offer_rules:
          '{"type":"percent","percent":20,"appliesTo":"subscriptions","maxUnits":2,"oncePerCustomer":true,"audienceTags":["lapsed-subscriber"]}',
      },
    };
    const result = discountConfig(entry, live.collection, live.products);
    expect("config" in result && result.config).toMatchObject({
      rules: {
        type: "percent",
        percent: 20,
        appliesTo: "subscriptions",
        maxUnits: 2,
        oncePerCustomer: true,
      },
      usedTags: ["campaign:black-friday-2026"],
      audienceTags: ["lapsed-subscriber"],
    });
  });

  it("lists every covered variant once a product is narrowed", () => {
    const products = live.products.map((product, i) =>
      i === 0
        ? {
            ...product,
            variants: [
              { ...product.variants[0]!, campaignId: live.entry.id },
              { ...product.variants[1]!, campaignId: null },
            ],
          }
        : product,
    );
    const result = discountConfig(live.entry, live.collection, products);
    expect("config" in result && result.config.variantIds).toEqual([
      "gid://shopify/ProductVariant/52871791477048",
      "gid://shopify/ProductVariant/52871791378744",
      "gid://shopify/ProductVariant/52871790756152",
    ]);
  });

  it("writes tier thresholds as the Function reads them", () => {
    const entry = {
      ...live.entry,
      fields: {
        ...live.entry.fields,
        offer_rules: '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":15}]}',
      },
    };
    const result = discountConfig(entry, live.collection, live.products);
    expect("config" in result && result.config.rules).toEqual({
      type: "tiered",
      tiers: [{ minSubtotal: "40", percent: 15 }],
    });
  });

  it("compares configs whatever their key order", () => {
    expect(sameConfig({ a: 1, b: [{ c: 2, d: 3 }] }, { b: [{ d: 3, c: 2 }], a: 1 })).toBe(
      true,
    );
    expect(sameConfig({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("calendar", () => {
  const entry = (
    handle: string,
    starts: string,
    ends: string,
    published = true,
  ): CampaignEntry => ({
    ...live.entry,
    id: `gid://shopify/Metaobject/${handle}`,
    handle,
    published,
    fields: { ...live.entry.fields, title: handle, starts_at: starts, ends_at: ends },
  });

  it("sorts by date and flags overlaps and ended campaigns", () => {
    const result = calendar(
      [
        entry("january", "2027-01-02T00:00:00Z", "2027-01-10T00:00:00Z"),
        entry("black-friday", "2026-11-27T00:00:00Z", "2026-12-01T00:00:00Z"),
        entry("cyber", "2026-11-30T00:00:00Z", "2026-12-02T00:00:00Z", false),
        entry("summer", "2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z"),
      ],
      new Date("2026-11-28T12:00:00Z"),
    );
    expect(result.rows.map((row) => `${row.handle}:${row.state}`)).toEqual([
      "summer:ended",
      "black-friday:live",
      "cyber:draft",
      "january:upcoming",
    ]);
    expect(result.notes).toEqual([
      "black-friday and cyber overlap at the same priority: the one ending first gets the banner. Set priority on the one that should lead.",
      "Ended, to delete with their collections and discounts: summer.",
    ]);
  });
});

describe("templateFields", () => {
  it("fills the dates in UK time, the end as its last minute", () => {
    const fields = Object.fromEntries(
      templateFields(
        "black-friday",
        new Date("2027-11-26T00:00:00Z"),
        new Date("2027-11-30T00:00:00Z"),
      ).map((field) => [field.key, field.value]),
    );
    expect(fields.title).toBe("Black Friday 2027");
    expect(fields.banner_text).toBe(
      "Black Friday: 25% off one-time orders until Monday midnight",
    );
    expect(fields.terms).toContain(
      "from 00:00 on Friday 26 November 2027 to 23:59 on Monday 29 November 2027",
    );
    expect(fields.offer_rules).toBe('{"type":"percent","percent":25}');
    expect(fields.starts_at).toBe("2027-11-26T00:00:00.000Z");
    expect("subscriber_perk" in fields).toBe(false);
  });

  it("makes campaigns the checks pass, for every template", () => {
    for (const name of ["black-friday", "january-reset", "summer"] as const) {
      const fields = Object.fromEntries(
        templateFields(
          name,
          new Date("2027-01-02T00:00:00Z"),
          new Date("2027-01-10T00:00:00Z"),
        ).map((f) => [f.key, f.value]),
      );
      // Templates have no body; Black Friday's would leak in.
      const wording = errors(
        checkCampaign(withFields({ body: null, ...fields }), BEFORE),
      ).filter((e) => e.includes(" says "));
      expect(wording, name).toEqual([]);
    }
  });
});

describe("plannedEmails", () => {
  it("times the launch and the last day from the campaign", () => {
    expect(plannedEmails(live.entry)).toEqual([
      {
        name: "Black Friday 2026: launch",
        sendAt: "2026-11-27T00:00:00.000Z",
        subject: "Black Friday: 25% off one-time orders",
        previewText: "25% off one-time orders, taken at checkout",
      },
      {
        name: "Black Friday 2026: last day",
        sendAt: "2026-11-30T00:00:00.000Z",
        subject: "Last day: 25% off one-time orders, taken at checkout",
        previewText: "Black Friday 2026. Ends 23:59 Mon 30 Nov.",
      },
    ]);
  });
});

describe("campaignReport", () => {
  const order = (overrides: Partial<ReportOrder>): ReportOrder => ({
    name: "#1",
    createdAt: "2026-11-27T10:00:00Z",
    subtotal: 30,
    currencyCode: "GBP",
    discounts: [],
    campaignDiscount: 0,
    attributes: {},
    sourceName: "web",
    utmSource: null,
    utmCampaign: null,
    customerOrders: 3,
    lines: [{ title: "Vitamin D3", quantity: 1, subscription: false }],
    ...overrides,
  });
  const campaign = {
    handle: "black-friday-2026",
    discountTitles: ["Black Friday 2026 (campaign)"],
  };

  it("counts orders with the discount or the campaign tag, and sums them", () => {
    const report = campaignReport(
      [
        order({
          name: "#1",
          discounts: ["Black Friday 2026 (campaign)"],
          campaignDiscount: 7.5,
          utmSource: "klaviyo",
          utmCampaign: "bf-launch",
        }),
        order({
          name: "#2",
          attributes: { _campaign: "black-friday-2026", _surface: "app" },
          subtotal: 45,
          customerOrders: 1,
          lines: [{ title: "Whey Protein", quantity: 2, subscription: true }],
        }),
        order({ name: "#3", subtotal: 99 }),
      ],
      campaign,
    );
    expect(report).toEqual({
      orders: 2,
      revenue: 75,
      discountCost: 7.5,
      currencyCode: "GBP",
      bySurface: { theme: 1, app: 1 },
      bySource: { "klaviyo / bf-launch": 1, "direct or unknown": 1 },
      firstOrders: 1,
      subscriptionsStarted: 1,
      topProducts: [
        { title: "Whey Protein", quantity: 2 },
        { title: "Vitamin D3", quantity: 1 },
      ],
      byHour: [{ hour: "2026-11-27 10", orders: 2 }],
    });
  });
});

describe("plannedPushes", () => {
  it("times the pushes like the emails and opens the campaign screen", () => {
    expect(plannedPushes(live.entry)).toEqual([
      {
        name: "Black Friday 2026: launch push",
        sendAt: "2026-11-27T00:00:00.000Z",
        title: "Black Friday is on",
        body: "25% off one-time orders, taken at checkout",
        deepLink: "formulate://pages/campaigns/black-friday-2026",
      },
      {
        name: "Black Friday 2026: last day push",
        sendAt: "2026-11-30T00:00:00.000Z",
        title: "Last day of Black Friday",
        body: "25% off one-time orders, taken at checkout. Ends 23:59 Mon 30 Nov.",
        deepLink: "formulate://pages/campaigns/black-friday-2026",
      },
    ]);
  });
});

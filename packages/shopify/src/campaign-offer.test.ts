import { describe, expect, it } from "vitest";

import {
  campaignCartProgress,
  campaignCountdown,
  campaignUnitPrice,
  offerLines,
  offerPercents,
  parseOfferRules,
  type OfferLine,
} from "./campaign-offer";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

describe("parseOfferRules", () => {
  it("reads a percent offer, one-time only by default", () => {
    expect(parseOfferRules('{"type":"percent","percent":25}')).toEqual({
      type: "percent",
      percent: 25,
      oneTimeOnly: true,
    });
  });

  it("lets an offer cover subscriptions too", () => {
    expect(
      parseOfferRules('{"type":"percent","percent":10,"oneTimeOnly":false}')?.oneTimeOnly,
    ).toBe(false);
  });

  it("reads tiers in GBP unless told otherwise", () => {
    const rules = parseOfferRules(
      '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":15},{"minSubtotal":"60.00","percent":25}]}',
    );
    expect(rules).toEqual({
      type: "tiered",
      oneTimeOnly: true,
      tiers: [
        { minSubtotal: gbp("40"), percent: 15 },
        { minSubtotal: gbp("60.00"), percent: 25 },
      ],
    });
  });

  it("reads a bundle", () => {
    expect(parseOfferRules('{"type":"bundle","buy":3,"free":1}')).toEqual({
      type: "bundle",
      buy: 3,
      free: 1,
      oneTimeOnly: true,
    });
  });

  it.each([
    ["empty", ""],
    ["not JSON", "25%"],
    ["an array", "[]"],
    ["an unknown type", '{"type":"bogof"}'],
    ["a fractional percent", '{"type":"percent","percent":12.5}'],
    ["100% off", '{"type":"percent","percent":100}'],
    ["a percent as text", '{"type":"percent","percent":"25"}'],
    ["no tiers", '{"type":"tiered","tiers":[]}'],
    [
      "tiers out of order",
      '{"type":"tiered","tiers":[{"minSubtotal":"60","percent":25},{"minSubtotal":"40","percent":15}]}',
    ],
    [
      "a higher tier worth less",
      '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":25},{"minSubtotal":"60","percent":15}]}',
    ],
    [
      "a threshold as a number",
      '{"type":"tiered","tiers":[{"minSubtotal":40,"percent":15}]}',
    ],
    [
      "a bad currency",
      '{"type":"tiered","currencyCode":"gbp","tiers":[{"minSubtotal":"40","percent":15}]}',
    ],
    ["everything free", '{"type":"bundle","buy":2,"free":2}'],
    ["a bundle of none", '{"type":"bundle","buy":0,"free":0}'],
  ])("rejects %s", (_, json) => {
    expect(parseOfferRules(json)).toBeNull();
  });
});

describe("campaignUnitPrice", () => {
  const percent = parseOfferRules('{"type":"percent","percent":25}');

  it("takes the percentage off, to the penny", () => {
    expect(campaignUnitPrice(percent, gbp("24.95"))).toEqual(gbp("18.71"));
    expect(campaignUnitPrice(percent, gbp("10.00"))).toEqual(gbp("7.50"));
  });

  it("gives no price for a subscription when the offer is one-time only", () => {
    expect(campaignUnitPrice(percent, gbp("24.95"), { subscription: true })).toBeNull();
    const both = parseOfferRules('{"type":"percent","percent":25,"oneTimeOnly":false}');
    expect(campaignUnitPrice(both, gbp("20.00"), { subscription: true })).toEqual(
      gbp("15.00"),
    );
  });

  it("gives no single price for tiers or bundles", () => {
    expect(
      campaignUnitPrice(parseOfferRules('{"type":"bundle","buy":3,"free":1}'), gbp("10")),
    ).toBeNull();
  });

  it("ignores prices it can't read", () => {
    expect(campaignUnitPrice(percent, gbp("n/a"))).toBeNull();
    expect(campaignUnitPrice(percent, gbp("0"))).toBeNull();
  });
});

describe("campaignCartProgress", () => {
  const tiered = parseOfferRules(
    '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":15},{"minSubtotal":"60","percent":25}]}',
  );
  const line = (amount: string, eligible = true, quantity = 1): OfferLine => ({
    subtotal: gbp(amount),
    quantity,
    eligible,
  });

  it("says how far to the first tier, counting only campaign items", () => {
    expect(
      campaignCartProgress(tiered, [line("28.00"), line("50.00", false)], "Black Friday"),
    ).toEqual({
      next: "Spend £12.00 more on Black Friday items for 15% off",
      reached: null,
    });
  });

  it("says what's reached and what's next", () => {
    expect(campaignCartProgress(tiered, [line("45.50")], "Black Friday")).toEqual({
      next: "Spend £14.50 more on Black Friday items for 25% off",
      reached: "15% off your Black Friday items at checkout",
    });
  });

  it("stops at the top tier, at exactly its threshold", () => {
    expect(
      campaignCartProgress(tiered, [line("30.00"), line("30.00")], "Black Friday"),
    ).toEqual({
      next: null,
      reached: "25% off your Black Friday items at checkout",
    });
  });

  it("counts items for a bundle", () => {
    const bundle = parseOfferRules('{"type":"bundle","buy":3,"free":1}');
    expect(campaignCartProgress(bundle, [line("10", true, 2)], "Black Friday")).toEqual({
      next: "Add 1 item from Black Friday for 1 more free",
      reached: null,
    });
    expect(campaignCartProgress(bundle, [line("10", true, 4)], "Black Friday")).toEqual({
      next: "Add 2 items from Black Friday for 1 more free",
      reached: "1 item free at checkout",
    });
  });

  it("says nothing with no campaign items, or for a percent offer", () => {
    expect(campaignCartProgress(tiered, [line("80", false)], "Black Friday")).toBeNull();
    expect(
      campaignCartProgress(
        parseOfferRules('{"type":"percent","percent":25}'),
        [line("80")],
        "BF",
      ),
    ).toBeNull();
  });
});

describe("offerLines", () => {
  const campaign = {
    handle: "black-friday-2026",
    rules: parseOfferRules('{"type":"bundle","buy":3,"free":1}'),
  };
  const cartLine = (handle: string | null, subscription = false) => ({
    quantity: 2,
    merchandise: {
      price: gbp("12.50"),
      product: { campaign: handle ? { reference: { handle } } : null },
    },
    sellingPlanAllocation: subscription ? { sellingPlan: { id: "1" } } : null,
  });

  it("prices the line before discounts and checks the campaign", () => {
    expect(offerLines(campaign, [cartLine("black-friday-2026")])).toEqual([
      { quantity: 2, subtotal: gbp("25.00"), eligible: true },
    ]);
    expect(offerLines(campaign, [cartLine("summer")])[0]?.eligible).toBe(false);
    expect(offerLines(campaign, [cartLine(null)])[0]?.eligible).toBe(false);
  });

  it("leaves subscriptions out of a one-time-only offer", () => {
    expect(offerLines(campaign, [cartLine("black-friday-2026", true)])[0]?.eligible).toBe(
      false,
    );
  });
});

describe("offerPercents", () => {
  it("lists every percentage the offer can give", () => {
    expect(
      offerPercents(
        parseOfferRules(
          '{"type":"tiered","tiers":[{"minSubtotal":"40","percent":15},{"minSubtotal":"60","percent":25}]}',
        )!,
      ),
    ).toEqual([15, 25]);
    expect(offerPercents(parseOfferRules('{"type":"bundle","buy":3,"free":1}')!)).toEqual(
      [],
    );
  });
});

describe("campaignCountdown", () => {
  const end = new Date("2026-12-01T00:00:00Z");
  const before = (ms: number) => new Date(end.getTime() - ms);

  it("counts down in the last day only", () => {
    expect(campaignCountdown(end, before(25 * 3_600_000))).toBeNull();
    expect(campaignCountdown(end, before(24 * 3_600_000))).toBe("Ends in 24h 0m");
    expect(campaignCountdown(end, before(5 * 3_600_000 + 12 * 60_000 + 30_000))).toBe(
      "Ends in 5h 12m",
    );
    expect(campaignCountdown(end, before(12 * 60_000))).toBe("Ends in 12m");
    expect(campaignCountdown(end, before(30_000))).toBe("Ends in under a minute");
  });

  it("says nothing once it has ended", () => {
    expect(campaignCountdown(end, end)).toBeNull();
  });
});

import { parseOfferRules } from "@formulate/shopify";
import { describe, expect, it } from "vitest";

import { checkCampaign } from "./check";
import live from "./fixtures/black-friday.json";
import { marginRows, worstUnitPrice } from "./margins";
import {
  checkReferencePrice,
  parseHistory,
  priceOn,
  recordPrice,
  ukDay,
  type PriceChange,
} from "./price-history";
import type { Snapshot } from "./types";

const STARTS = new Date("2026-11-27T00:00:00Z");
const BEFORE = new Date("2026-11-01T12:00:00Z");

describe("recordPrice", () => {
  it("starts a history, and writes nothing when the price hasn't changed", () => {
    expect(recordPrice([], "9.95", "2026-10-01")).toEqual([["2026-10-01", "9.95"]]);
    expect(recordPrice([["2026-10-01", "9.95"]], "9.95", "2026-10-02")).toBeNull();
    expect(recordPrice([["2026-10-01", "9.95"]], "9.950", "2026-10-02")).toBeNull();
  });

  it("adds a change, replacing one already recorded today", () => {
    expect(recordPrice([["2026-10-01", "9.95"]], "10.95", "2026-10-05")).toEqual([
      ["2026-10-01", "9.95"],
      ["2026-10-05", "10.95"],
    ]);
    expect(
      recordPrice(
        [
          ["2026-10-01", "9.95"],
          ["2026-10-05", "10.95"],
        ],
        "11.95",
        "2026-10-05",
      ),
    ).toEqual([
      ["2026-10-01", "9.95"],
      ["2026-10-05", "11.95"],
    ]);
  });

  it("trims old changes but keeps the one in force at the window's start", () => {
    const history: PriceChange[] = [
      ["2026-01-01", "8.95"],
      ["2026-03-01", "9.95"],
      ["2026-09-01", "10.95"],
    ];
    expect(recordPrice(history, "11.95", "2026-10-31")).toEqual([
      ["2026-03-01", "9.95"],
      ["2026-09-01", "10.95"],
      ["2026-10-31", "11.95"],
    ]);
  });
});

describe("parseHistory and priceOn", () => {
  it("ignores anything malformed", () => {
    expect(parseHistory("not json")).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    expect(
      parseHistory('[["2026-10-01","9.95"],["bad","1"],["2026-10-02","x"]]'),
    ).toEqual([["2026-10-01", "9.95"]]);
  });

  it("gives the price in force on a day", () => {
    const history: PriceChange[] = [
      ["2026-10-01", "9.95"],
      ["2026-10-10", "10.95"],
    ];
    expect(priceOn(history, "2026-09-30")).toBeNull();
    expect(priceOn(history, "2026-10-09")).toBe("9.95");
    expect(priceOn(history, "2026-10-10")).toBe("10.95");
  });

  it("dates by the UK day", () => {
    expect(ukDay(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    expect(ukDay(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08-01");
  });
});

describe("checkReferencePrice", () => {
  it("passes a price held for the 28 days before the start", () => {
    expect(checkReferencePrice([["2026-10-01", "9.95"]], "9.95", STARTS)).toEqual({
      ok: true,
    });
  });

  it("fails a price raised inside the window, naming the lower one", () => {
    expect(
      checkReferencePrice(
        [
          ["2026-10-01", "9.95"],
          ["2026-11-20", "12.95"],
        ],
        "12.95",
        STARTS,
      ),
    ).toEqual({ ok: false, reason: "raised", lower: "9.95", on: "2026-10-30" });
  });

  it("allows a price cut inside the window", () => {
    expect(
      checkReferencePrice(
        [
          ["2026-10-01", "12.95"],
          ["2026-11-20", "9.95"],
        ],
        "9.95",
        STARTS,
      ),
    ).toEqual({ ok: true });
  });

  it("can't tell without 28 days of history", () => {
    expect(checkReferencePrice([["2026-11-10", "9.95"]], "9.95", STARTS)).toEqual({
      ok: false,
      reason: "no-history",
      since: "2026-11-10",
    });
    expect(checkReferencePrice([], "9.95", STARTS)).toEqual({
      ok: false,
      reason: "no-history",
      since: null,
    });
  });
});

describe("worstUnitPrice and marginRows", () => {
  const percent = parseOfferRules('{"type":"percent","percent":25}')!;
  const tiered = parseOfferRules(
    '{"type":"tiered","tiers":[{"minSubtotal":"40.00","percent":10},{"minSubtotal":"60.00","percent":20}]}',
  )!;
  const bundle = parseOfferRules('{"type":"bundle","buy":3,"free":1}')!;
  const withSubscriptions = parseOfferRules(
    '{"type":"percent","percent":25,"oneTimeOnly":false}',
  )!;

  it("takes each offer at its worst", () => {
    expect(worstUnitPrice(percent, 20)).toBe(15);
    expect(worstUnitPrice(tiered, 20)).toBe(16);
    expect(worstUnitPrice(bundle, 30)).toBe(20);
    // 15% subscribe and save first, then 25%.
    expect(worstUnitPrice(withSubscriptions, 20)).toBe(12.75);
  });

  it("works out the margin when there's a cost", () => {
    expect(
      marginRows(percent, [
        { title: "A", price: "20.00", cost: "6.00" },
        { title: "B", price: "20.00", cost: null },
      ]),
    ).toEqual([
      { title: "A", price: 20, cost: 6, worst: 15, margin: 60 },
      { title: "B", price: 20, cost: null, worst: 15, margin: null },
    ]);
  });
});

describe("checkCampaign's prices and margins", () => {
  const snapshot = live as unknown as Snapshot;
  const withVariants = (
    patch: (
      variant: Snapshot["products"][number]["variants"][number],
      index: number,
    ) => object,
  ): Snapshot => ({
    ...snapshot,
    products: snapshot.products.map((product, p) => ({
      ...product,
      variants: product.variants.map((variant, v) => ({
        ...variant,
        ...patch(variant, p * 10 + v),
      })),
    })),
  });
  const messages = (s: Snapshot, level: "error" | "warning" | "ok") =>
    checkCampaign(s, BEFORE)
      .filter((finding) => finding.level === level)
      .map((finding) => finding.message);

  it("warns when there's no history or cost to check against", () => {
    const warnings = messages(snapshot, "warning");
    expect(warnings.some((w) => w.startsWith("No 28-day price history"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("No unit cost in Shopify"))).toBe(true);
  });

  it("passes held prices and healthy margins", () => {
    const healthy = withVariants((variant) => ({
      priceHistory: [["2026-09-01", variant.price]],
      cost: (Number(variant.price) * 0.3).toFixed(2),
    }));
    const oks = messages(healthy, "ok");
    expect(oks).toContain(
      'Every "Normally" price held for the 28 days before the start.',
    );
    expect(oks).toContain(
      "Every variant keeps at least a 30% margin at the campaign price.",
    );
    expect(messages(healthy, "error")).toEqual([]);
  });

  it("fails a price raised before the sale, and a sale below cost", () => {
    const bad = withVariants((variant, i) =>
      i === 0
        ? {
            priceHistory: [
              ["2026-09-01", "5.00"],
              ["2026-11-15", variant.price],
            ],
            cost: variant.price,
          }
        : { priceHistory: [["2026-09-01", variant.price]], cost: "0.50" },
    );
    const errors = messages(bad, "error");
    expect(
      errors.some((e) => e.startsWith("Raised in the 28 days before the campaign")),
    ).toBe(true);
    expect(
      errors.some((e) => e.startsWith("Sold below cost at the campaign price")),
    ).toBe(true);
  });

  it("warns under the margin floor, which --min-margin moves", () => {
    const thin = withVariants((variant) => ({
      priceHistory: [["2026-09-01", variant.price]],
      cost: (Number(variant.price) * 0.6).toFixed(2),
    }));
    // 25% off leaves 0.75 of the price; a cost of 0.6 is a 20% margin.
    expect(
      messages(thin, "warning").some((w) => w.startsWith("Under a 30% margin")),
    ).toBe(true);
    const relaxed = checkCampaign(thin, BEFORE, { minMargin: 15 });
    expect(relaxed.some((f) => f.message.startsWith("Under a"))).toBe(false);
  });
});

describe("checkCampaign's limits and audiences", () => {
  const snapshot = live as unknown as Snapshot;
  const withRules = (
    offerRules: string,
    fields: Record<string, string | null> = {},
  ): Snapshot => ({
    ...snapshot,
    entry: {
      ...snapshot.entry,
      fields: { ...snapshot.entry.fields, offer_rules: offerRules, ...fields },
    },
  });
  const levels = (s: Snapshot) => {
    const findings = checkCampaign(s, BEFORE);
    return {
      errors: findings.filter((f) => f.level === "error").map((f) => f.message),
      warnings: findings.filter((f) => f.level === "warning").map((f) => f.message),
    };
  };

  it("needs an audience offer to be email-link only", () => {
    const { errors } = levels(
      withRules('{"type":"percent","percent":25,"audienceTags":["lapsed-subscriber"]}'),
    );
    expect(errors.some((e) => e.includes("must be email-link only"))).toBe(true);
  });

  it("wants the terms to state the limits", () => {
    const { warnings } = levels(
      withRules('{"type":"percent","percent":25,"maxUnits":2,"oncePerCustomer":true}', {
        terms: "25% off one-time purchases. Ends Monday.",
      }),
    );
    expect(warnings).toContain(
      "The offer is once per customer, but the terms don't say so.",
    );
    expect(warnings).toContain(
      "The offer covers up to 2 of each product, but the terms don't say so.",
    );
  });

  it("says a plain discount can't enforce limits", () => {
    const { errors } = levels(
      withRules('{"type":"percent","percent":25,"maxUnits":2}', {
        terms: "Up to 2 of each product at the sale price.",
      }),
    );
    expect(
      errors.some((e) => e.includes("can't apply the offer's limits or audience")),
    ).toBe(true);
  });

  it("checks a plain discount against a subscribe-first offer", () => {
    const { errors } = levels(
      withRules('{"type":"percent","percent":25,"appliesTo":"subscriptions"}'),
    );
    // The live discount is one-time only: it leaves out subscriptions and includes one-time.
    expect(errors.some((e) => e.includes("leaves out subscriptions"))).toBe(true);
    expect(errors.some((e) => e.includes("includes one-time purchases"))).toBe(true);
  });
});

describe("checkCampaign's sign-off", () => {
  const snapshot = live as unknown as Snapshot;
  const at = (patch: { fields?: Record<string, string | null>; updatedAt?: string }) =>
    checkCampaign(
      {
        ...snapshot,
        entry: {
          ...snapshot.entry,
          ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {}),
          fields: { ...snapshot.entry.fields, ...patch.fields },
        },
      },
      BEFORE,
    )
      .filter((f) => f.level === "error")
      .map((f) => f.message);

  it("fails until someone approves it", () => {
    expect(at({ fields: { approved_by: null, approved_at: null } })).toContain(
      "Not signed off: run campaigns approve <handle> --by <name> once it's right.",
    );
  });

  it("allows approval's own save, but not a later edit", () => {
    expect(
      at({ updatedAt: "2026-10-30T12:01:00Z" }).some((e) =>
        e.startsWith("Changed since"),
      ),
    ).toBe(false);
    expect(
      at({ updatedAt: "2026-10-31T09:00:00Z" }).some((e) =>
        e.startsWith("Changed since Ben approved"),
      ),
    ).toBe(true);
  });
});

describe("checkCampaign's stock", () => {
  const snapshot = live as unknown as Snapshot;
  const withStock = (stock: (i: number) => number | null): Snapshot => ({
    ...snapshot,
    products: snapshot.products.map((product, p) => ({
      ...product,
      variants: product.variants.map((variant, v) => ({
        ...variant,
        stock: stock(p * 10 + v),
      })),
    })),
  });
  const warnings = (s: Snapshot, minStock?: number) =>
    checkCampaign(s, BEFORE, minStock === undefined ? {} : { minStock })
      .filter((f) => f.level === "warning")
      .map((f) => f.message);

  it("warns about sold-out and low stock", () => {
    const w = warnings(withStock((i) => (i === 0 ? 0 : i === 1 ? 3 : 50)));
    expect(w.some((m) => m.startsWith("Sold out: "))).toBe(true);
    expect(w.some((m) => m.startsWith("Under 10 in stock: ") && m.includes("(3)"))).toBe(
      true,
    );
  });

  it("says nothing about stock it doesn't track", () => {
    expect(warnings(withStock(() => null)).some((m) => /stock|Sold out/.test(m))).toBe(
      false,
    );
  });

  it("moves the threshold with --min-stock", () => {
    expect(
      warnings(
        withStock(() => 20),
        30,
      ).some((m) => m.startsWith("Under 30")),
    ).toBe(true);
  });
});

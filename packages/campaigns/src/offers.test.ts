import { describe, expect, it } from "vitest";

import { checkCampaign } from "./check";
import blackFriday from "./fixtures/black-friday.json";
import { parseSegmentOffers, segmentDiscountConfigs, segmentOf } from "./offers";
import { segmentOfferSentence } from "./terms";
import type { Snapshot } from "./types";

const live = blackFriday as unknown as Snapshot;
const BEFORE = new Date("2026-11-01T00:00:00Z");

const LAPSED = {
  segment: "lapsed",
  delivery: "sign_in",
  rules: { type: "percent", percent: 30 },
};

describe("parseSegmentOffers", () => {
  it("is empty when the field is", () => {
    expect(parseSegmentOffers(null)).toEqual({ offers: [], problems: [] });
  });

  it("parses each offer's rules as offer_rules", () => {
    const { offers, problems } = parseSegmentOffers(JSON.stringify([LAPSED]));
    expect(problems).toEqual([]);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      segment: "lapsed",
      delivery: "sign_in",
      rules: { type: "percent", percent: 30, appliesTo: "one_time" },
    });
  });

  it("names what's wrong with each bad offer", () => {
    const { offers, problems } = parseSegmentOffers(
      JSON.stringify([
        { ...LAPSED, segment: "vip" },
        { ...LAPSED, delivery: "post" },
        { ...LAPSED, rules: { type: "percent", percent: 300 } },
        { ...LAPSED, rules: { type: "percent", percent: 30, audienceTags: ["x"] } },
        LAPSED,
        LAPSED,
      ]),
    );
    expect(offers).toHaveLength(1);
    expect(problems).toEqual([
      "offers[0]: segment is one of active, lapsed, at_risk, one_time, dormant, best",
      "offers[1]: delivery is one of sign_in, email_link, codes",
      "offers[2]: rules don't parse (the same rules as offer_rules)",
      "offers[3]: rules can't set audienceTags or shipping",
      "offers[5]: lapsed already has an offer",
    ]);
  });

  it("reports a field that isn't a list of offers", () => {
    expect(parseSegmentOffers("{").problems).toEqual(["offers isn't JSON"]);
    expect(parseSegmentOffers("{}").problems).toEqual(["offers isn't a list"]);
  });
});

describe("segmentDiscountConfigs", () => {
  it("gives a signed-in offer the campaign's config, its rules and its tag", () => {
    const { offers } = parseSegmentOffers(
      JSON.stringify([LAPSED, { ...LAPSED, segment: "one_time", delivery: "codes" }]),
    );
    const result = segmentDiscountConfigs(
      live.entry,
      live.collection,
      live.products,
      offers,
    );
    expect(result).toEqual({
      configs: [
        {
          segment: "lapsed",
          config: {
            campaign: "black-friday-2026",
            collectionIds: ["gid://shopify/Collection/524187107640"],
            variantIds: [],
            message: "Black Friday",
            rules: { type: "percent", percent: 30 },
            usedTags: [],
            audienceTags: ["segment:lapsed"],
            segment: "lapsed",
          },
        },
      ],
    });
    // Codes aren't built yet, so only the signed-in offer is made.
    if ("configs" in result) expect(segmentOf(result.configs[0]!.config)).toBe("lapsed");
  });
});

describe("segmentOfferSentence", () => {
  it("says who, how and what", () => {
    const { offers } = parseSegmentOffers(JSON.stringify([LAPSED]));
    expect(segmentOfferSentence(offers[0]!)).toBe(
      "Past subscribers, signed in to their account: 30% off one-time purchases instead.",
    );
  });

  it("states the limits the Function enforces", () => {
    const { offers } = parseSegmentOffers(
      JSON.stringify([
        { ...LAPSED, rules: { ...LAPSED.rules, maxUnits: 2, oncePerCustomer: true } },
      ]),
    );
    expect(segmentOfferSentence(offers[0]!)).toBe(
      "Past subscribers, signed in to their account: 30% off one-time purchases instead, up to 2 of each product per order, once per customer.",
    );
  });
});

describe("checkCampaign with segment offers", () => {
  const withOffers = (offers: string): Snapshot => ({
    ...live,
    entry: { ...live.entry, fields: { ...live.entry.fields, offers } },
  });

  it("reports offers that don't parse, and deliveries not built yet", () => {
    const messages = checkCampaign(
      withOffers(
        JSON.stringify([
          { ...LAPSED, segment: "vip" },
          { ...LAPSED, delivery: "codes" },
        ]),
      ),
      BEFORE,
    ).map((f) => `${f.level}: ${f.message}`);
    expect(messages).toContain(
      "error: offers: offers[0]: segment is one of active, lapsed, at_risk, one_time, dormant, best.",
    );
    expect(messages).toContain(
      "warning: The lapsed offer's delivery (codes) isn't built yet: campaigns sync skips it.",
    );
  });

  it("warns when the terms leave out a segment offer's limits", () => {
    const messages = checkCampaign(
      withOffers(
        JSON.stringify([
          { ...LAPSED, rules: { ...LAPSED.rules, maxUnits: 7, oncePerCustomer: true } },
        ]),
      ),
      BEFORE,
    ).map((f) => f.message);
    expect(messages).toContain(
      "The lapsed offer is once per customer, but the terms don't say so.",
    );
    expect(messages).toContain(
      "The lapsed offer covers up to 7 of each product, but the terms don't say so.",
    );
  });

  it("reports a broken campaign config on a segment discount, not a missing offer", () => {
    const snapshot = withOffers(JSON.stringify([LAPSED]));
    const broken: Snapshot = {
      ...snapshot,
      collection: null,
      discounts: [
        ...snapshot.discounts,
        {
          ...snapshot.discounts[0]!,
          id: "gid://shopify/DiscountAutomaticNode/9",
          title: "Black Friday 2026: past subscribers",
          kind: "app",
          config: { campaign: live.entry.handle, segment: "lapsed" },
        },
      ],
    };
    const messages = checkCampaign(broken, BEFORE)
      .map((f) => f.message)
      .filter((m) => m.includes("past subscribers"));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes("has no offer now"))).toBe(false);
  });

  it("checks each offer's margin", () => {
    const deep = withOffers(
      JSON.stringify([{ ...LAPSED, rules: { type: "percent", percent: 90 } }]),
    );
    // Every variant costs 30% of its price: fine at 25% off, a loss at 90%.
    const costed: Snapshot = {
      ...deep,
      products: deep.products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({
          ...variant,
          cost: (Number(variant.price) * 0.3).toFixed(2),
        })),
      })),
    };
    const messages = checkCampaign(costed, BEFORE).map((f) => f.message);
    expect(messages.some((m) => m.startsWith("The lapsed offer sells below cost"))).toBe(
      true,
    );
  });
});

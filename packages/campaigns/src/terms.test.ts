import { describe, expect, it } from "vitest";

import { campaignOf } from "./campaign-node";
import live from "./fixtures/black-friday.json";
import { campaignTerms } from "./terms";
import { parseOfferRules } from "@formulate/shopify";
import type { CampaignEntry } from "./types";

describe("campaignTerms", () => {
  const campaign = campaignOf(live.entry as CampaignEntry, "black-friday")!;
  it("writes the dates, offer, reach and exclusions from the rules", () => {
    const terms = campaignTerms(
      campaign,
      parseOfferRules('{"type":"percent","percent":25,"maxUnits":2}')!,
    );
    expect(terms).toContain("25% off one-time purchases of the products on this page");
    expect(terms).toContain(
      "from 00:00 on Friday 27 November 2026 to 23:59 on Monday 30 November 2026 (UK time).",
    );
    expect(terms).toContain("Up to 2 of each product per order");
    expect(terms).toContain("Doesn't apply to subscriptions.");
    expect(terms).toContain("demo store");
    expect(terms).toContain(
      "one per active subscription, added to the next delivery after 30 November.",
    );
  });
});

describe("check against the generated terms", () => {
  it("warns when the saved terms differ, and not when they match", async () => {
    const { checkCampaign } = await import("./check");
    const snapshot = live as unknown as import("./types").Snapshot;
    const campaign = campaignOf(snapshot.entry, "black-friday")!;
    const rules = parseOfferRules(snapshot.entry.fields.offer_rules)!;
    const at = new Date("2026-11-01T12:00:00Z");
    const message =
      "terms differ from what the offer's rules write: run campaigns terms <handle> to compare.";
    const warnings = (terms: string) =>
      checkCampaign(
        {
          ...snapshot,
          entry: { ...snapshot.entry, fields: { ...snapshot.entry.fields, terms } },
        },
        at,
      )
        .filter((f) => f.level === "warning")
        .map((f) => f.message);
    expect(warnings("Something else.")).toContain(message);
    expect(warnings(campaignTerms(campaign, rules))).not.toContain(message);
  });
});

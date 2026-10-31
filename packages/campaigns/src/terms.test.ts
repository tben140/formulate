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
  });
});

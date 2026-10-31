import { describe, expect, it } from "vitest";

import { campaignOf } from "./campaign-node";
import live from "./fixtures/black-friday.json";
import { urgencyFlow } from "./flows";
import type { CampaignEntry } from "./types";

describe("urgencyFlow", () => {
  const campaign = campaignOf(live.entry as CampaignEntry, "black-friday")!;
  const flow = urgencyFlow(campaign, "Black Friday", {
    checkoutStarted: "UprmRa",
    placedOrder: "V2sqtM",
  });

  it("triggers on checkouts holding the campaign's collection", () => {
    expect(flow.definition.triggers[0]).toMatchObject({
      id: "UprmRa",
      trigger_filter: {
        condition_groups: [
          {
            conditions: [
              {
                field: "Collections",
                filter: { operator: "contains", value: "Black Friday" },
              },
            ],
          },
        ],
      },
    });
  });

  it("waits an hour, then a draft email from the record's wording", () => {
    const [wait, email] = flow.definition.actions;
    expect(wait).toMatchObject({
      type: "time-delay",
      data: { value: 1, unit: "hours" },
      links: { next: "email" },
    });
    expect(email).toMatchObject({
      type: "send-email",
      data: {
        status: "draft",
        message: { subject_line: expect.stringContaining("Black Friday") },
      },
    });
  });

  it("leaves alone anyone who's ordered, and sends once", () => {
    expect(JSON.stringify(flow.definition.profile_filter)).toContain("V2sqtM");
    expect(flow.definition.reentry_criteria).toEqual({ duration: 1, unit: "alltime" });
  });
});

import { describe, expect, it } from "vitest";

import {
  activeCampaign,
  campaignBadge,
  campaignEndsLabel,
  campaignForVariant,
  campaignNow,
  campaignParagraphs,
  campaignPath,
  campaignStartFor,
  campaignStartsLabel,
  campaignHandleFromPath,
  campaignStatus,
  isCampaignLive,
  safeRedirectPath,
  toCampaign,
  type CampaignNode,
} from "./campaign";

const v = (value: string) => ({ value });

const blackFriday: CampaignNode = {
  handle: "black-friday-2026",
  title: v("Black Friday 2026"),
  startsAt: v("2026-11-27T00:00:00Z"),
  endsAt: v("2026-12-01T00:00:00Z"),
  badge: v("Black Friday"),
  offer: v("25% off one-time orders, taken at checkout"),
  terms: v("25% off one-time purchases."),
};

const before = new Date("2026-11-26T23:59:59Z");
const during = new Date("2026-11-28T12:00:00Z");
const end = new Date("2026-12-01T00:00:00Z");

describe("toCampaign", () => {
  it("fills headline and banner from the title and offer", () => {
    const campaign = toCampaign(blackFriday);
    expect(campaign?.headline).toBe("Black Friday 2026");
    expect(campaign?.bannerText).toBe("25% off one-time orders, taken at checkout");
    expect(campaign?.discountCode).toBeNull();
  });

  it("refuses a campaign it can't state honestly", () => {
    expect(toCampaign({ ...blackFriday, endsAt: v("2026-11-01T00:00:00Z") })).toBeNull();
    expect(toCampaign({ ...blackFriday, startsAt: v("not a date") })).toBeNull();
    expect(toCampaign({ ...blackFriday, terms: v(" ") })).toBeNull();
    expect(toCampaign(null)).toBeNull();
  });
});

describe("activeCampaign", () => {
  it("is live from the start up to, not including, the end", () => {
    expect(activeCampaign([blackFriday], { now: before })).toBeNull();
    expect(
      activeCampaign([blackFriday], { now: new Date("2026-11-27T00:00:00Z") })?.handle,
    ).toBe("black-friday-2026");
    expect(activeCampaign([blackFriday], { now: end })).toBeNull();
  });

  it("leads with the campaign ending soonest", () => {
    const flash = {
      ...blackFriday,
      handle: "flash",
      endsAt: v("2026-11-29T00:00:00Z"),
    };
    expect(activeCampaign([blackFriday, flash, null], { now: during })?.handle).toBe(
      "flash",
    );
  });
});

describe("campaignForVariant", () => {
  const product = { reference: blackFriday };
  const in90 = { campaign: { reference: { handle: "black-friday-2026" } } };
  const notIn = { campaign: null };

  it("covers every variant when none is narrowed", () => {
    expect(campaignForVariant(product, notIn, [null, null], { now: during })?.badge).toBe(
      "Black Friday",
    );
  });

  it("covers only the marked variants when some are", () => {
    const refs = [in90.campaign, null];
    expect(campaignForVariant(product, in90, refs, { now: during })).not.toBeNull();
    expect(campaignForVariant(product, notIn, refs, { now: during })).toBeNull();
  });

  it("shows nothing outside the dates", () => {
    expect(campaignForVariant(product, notIn, [], { now: before })).toBeNull();
  });
});

describe("campaignBadge", () => {
  it("badges a card only while the campaign is live", () => {
    expect(campaignBadge({ reference: blackFriday }, { now: during })).toBe(
      "Black Friday",
    );
    expect(campaignBadge({ reference: blackFriday }, { now: before })).toBeNull();
    expect(campaignBadge(null, { now: during })).toBeNull();
  });
});

describe("helpers", () => {
  it("states the real end in UK time", () => {
    const campaign = toCampaign(blackFriday);
    expect(campaign && campaignEndsLabel(campaign)).toBe("Ends 23:59 Mon 30 Nov");
    expect(campaign && campaignStartsLabel(campaign)).toBe("Starts 00:00 Fri 27 Nov");
  });

  it("knows whether a campaign is upcoming, live or over", () => {
    const campaign = toCampaign(blackFriday);
    if (!campaign) throw new Error("expected a campaign");
    expect(campaignStatus(campaign, { now: before })).toBe("upcoming");
    expect(campaignStatus(campaign, { now: during })).toBe("active");
    expect(campaignStatus(campaign, { now: end })).toBe("ended");
  });

  it("uses a preview time only when it parses", () => {
    expect(campaignNow("2026-11-28T12:00:00Z")).toEqual(during);
    expect(campaignNow("soon").getTime()).toBeGreaterThan(during.getTime() - 1e12);
  });

  it("gives the theme's metaobject page path", () => {
    expect(campaignPath("black-friday-2026")).toBe("/pages/campaigns/black-friday-2026");
  });

  it("reads rich text as paragraphs, and survives bad JSON", () => {
    const body = JSON.stringify({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "One." }] },
        { type: "paragraph", children: [{ type: "text", value: " " }] },
        { type: "heading", children: [{ type: "text", value: "Two" }] },
      ],
    });
    expect(campaignParagraphs(body)).toEqual(["One.", "Two"]);
    expect(campaignParagraphs("{")).toEqual([]);
    expect(campaignParagraphs(null)).toEqual([]);
  });
});

describe("who sees a campaign", () => {
  const emailOnly: CampaignNode = {
    ...blackFriday,
    handle: "vip",
    audience: v("email_link"),
  };

  it("hides an email-link campaign from everyone without the link", () => {
    expect(activeCampaign([emailOnly], { now: during })).toBeNull();
    expect(campaignBadge({ reference: emailOnly }, { now: during })).toBeNull();
    const campaign = toCampaign(emailOnly);
    expect(campaign && campaignStatus(campaign, { now: during })).toBe("restricted");
  });

  it("shows it to someone who came through the link, on its dates", () => {
    const access = new Set(["vip"]);
    expect(activeCampaign([emailOnly], { now: during, access })?.handle).toBe("vip");
    expect(activeCampaign([emailOnly], { now: before, access })).toBeNull();
  });

  it("shows a previewed campaign as live, whatever its dates or audience", () => {
    const view = { now: before, preview: "vip" };
    expect(activeCampaign([blackFriday, emailOnly], view)?.handle).toBe("vip");
    expect(campaignBadge({ reference: emailOnly }, view)).toBe("Black Friday");
    const campaign = toCampaign(emailOnly);
    expect(campaign && campaignStatus(campaign, view)).toBe("active");
    // Only the previewed one: Black Friday itself is still upcoming.
    expect(campaignBadge({ reference: blackFriday }, view)).toBeNull();
  });
});

describe("email links", () => {
  it("redirects only to a path on this site", () => {
    expect(safeRedirectPath("/pages/campaigns/vip")).toBe("/pages/campaigns/vip");
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("finds the campaign a landing path belongs to", () => {
    expect(campaignHandleFromPath("/pages/campaigns/vip")).toBe("vip");
    expect(campaignHandleFromPath("/pages/campaigns/vip?x=1")).toBe("vip");
    expect(campaignHandleFromPath("/products/vip")).toBeNull();
  });
});

describe("early access", () => {
  const early = toCampaign({
    ...blackFriday,
    earlyAccessStartsAt: v("2026-11-26T18:00:00Z"),
  })!;
  const evening = new Date("2026-11-26T20:00:00Z");

  it("starts early only for people who came through the email link", () => {
    expect(
      isCampaignLive(early, { now: evening, access: new Set(["black-friday-2026"]) }),
    ).toBe(true);
    expect(isCampaignLive(early, { now: evening })).toBe(false);
    expect(campaignStatus(early, { now: evening })).toBe("upcoming");
  });

  it("says when it starts for this visitor", () => {
    const view = {
      now: new Date("2026-11-20T00:00:00Z"),
      access: new Set(["black-friday-2026"]),
    };
    expect(campaignStartsLabel(early, campaignStartFor(early, view))).toBe(
      "Starts 18:00 Thu 26 Nov",
    );
  });

  it("is ignored unless it's before the start", () => {
    expect(
      toCampaign({ ...blackFriday, earlyAccessStartsAt: v("2026-11-28T00:00:00Z") })!
        .earlyAccessStartsAt,
    ).toBeNull();
  });
});

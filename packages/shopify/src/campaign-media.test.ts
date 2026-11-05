import { describe, expect, it } from "vitest";

import {
  campaignImages,
  withCampaignImages,
  type CampaignMediaField,
} from "./campaign-media";

const f = (value: string) => ({ value });
const campaign = (handle: string, startsAt: string, endsAt: string) => ({
  handle,
  title: f(handle),
  startsAt: f(startsAt),
  endsAt: f(endsAt),
  badge: f("Sale"),
  offer: f("25% off"),
  terms: f("Terms"),
});
const image = (url: string) => ({ url, altText: `alt for ${url}` });
const media = (
  entries: { campaign: ReturnType<typeof campaign>; urls: string[] }[],
): CampaignMediaField => ({
  references: {
    nodes: entries.map((entry) => ({
      campaign: { reference: entry.campaign },
      images: { references: { nodes: entry.urls.map((url) => ({ image: image(url) })) } },
    })),
  },
});

const bf = campaign("black-friday", "2026-11-27T00:00:00Z", "2026-12-01T00:00:00Z");
const xmas = campaign("christmas", "2026-12-10T00:00:00Z", "2026-12-24T00:00:00Z");
const field = media([
  { campaign: bf, urls: ["https://cdn/bf-1.jpg", "https://cdn/bf-2.jpg"] },
  { campaign: xmas, urls: ["https://cdn/xmas.jpg"] },
]);

describe("campaignImages", () => {
  it("leads with the live campaign's images", () => {
    const view = { now: new Date("2026-11-28T12:00:00Z") };
    expect(campaignImages(field, view).map((i) => i.url)).toEqual([
      "https://cdn/bf-1.jpg",
      "https://cdn/bf-2.jpg",
    ]);
    expect(campaignImages(field, { now: new Date("2026-12-12T00:00:00Z") })[0]?.url).toBe(
      "https://cdn/xmas.jpg",
    );
  });

  it("is empty before, between and after campaigns, and without the field", () => {
    expect(campaignImages(field, { now: new Date("2026-11-20T00:00:00Z") })).toEqual([]);
    expect(campaignImages(field, { now: new Date("2026-12-05T00:00:00Z") })).toEqual([]);
    expect(campaignImages(null, { now: new Date("2026-11-28T00:00:00Z") })).toEqual([]);
  });

  it("counts a preview as live", () => {
    const view = { now: new Date("2026-11-01T00:00:00Z"), preview: "black-friday" };
    expect(campaignImages(field, view)).toHaveLength(2);
  });
});

describe("withCampaignImages", () => {
  it("puts the campaign's first and drops the same image from the product's own", () => {
    const own = [image("https://cdn/own.jpg?v=1"), image("https://cdn/bf-1.jpg?v=2")];
    expect(
      withCampaignImages([image("https://cdn/bf-1.jpg")], own).map((i) => i.url),
    ).toEqual(["https://cdn/bf-1.jpg", "https://cdn/own.jpg?v=1"]);
  });
});

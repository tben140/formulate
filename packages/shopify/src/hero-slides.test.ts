import { describe, expect, it } from "vitest";

import { heroSlides, type HeroSlideNode } from "./hero-slides";

const f = (value: string) => ({ value });
const campaign = (handle: string, startsAt: string, endsAt: string, priority = "0") => ({
  handle,
  title: f(handle),
  startsAt: f(startsAt),
  endsAt: f(endsAt),
  badge: f(handle.toUpperCase()),
  headline: f(`${handle} headline`),
  offer: f("25% off"),
  terms: f("Terms"),
  priority: f(priority),
});
const slide = (
  handle: string,
  fields: Partial<Record<keyof HeroSlideNode, string>> = {},
): HeroSlideNode => ({
  handle,
  headline: f(fields.headline ?? handle),
  link: fields.link ? f(fields.link) : null,
  startsAt: fields.startsAt ? f(fields.startsAt) : null,
  endsAt: fields.endsAt ? f(fields.endsAt) : null,
  priority: fields.priority ? f(fields.priority) : null,
  isDefault: fields.isDefault ? f(fields.isDefault) : null,
});

const bf = campaign("black-friday", "2026-11-27T00:00:00Z", "2026-12-01T00:00:00Z");
const flash = campaign("flash", "2026-11-28T00:00:00Z", "2026-11-29T00:00:00Z", "5");
const slides = [
  slide("welcome", { isDefault: "true", link: "/collections/best-sellers" }),
  slide("quiz", { isDefault: "true", priority: "3", link: "/routine" }),
  slide("gift-guide", {
    startsAt: "2026-12-01T00:00:00Z",
    endsAt: "2026-12-24T00:00:00Z",
  }),
  slide("app", { priority: "1" }),
];
const keys = (now: string, preview?: string) =>
  heroSlides([bf, flash], slides, { now: new Date(now), preview }).map((s) => s.key);

describe("heroSlides", () => {
  it("leads with live campaigns by priority, then running slides; no defaults", () => {
    expect(keys("2026-11-28T12:00:00Z")).toEqual([
      "campaign:flash",
      "campaign:black-friday",
      "slide:app",
    ]);
  });

  it("puts a previewed campaign first", () => {
    expect(keys("2026-11-28T12:00:00Z", "black-friday")[0]).toBe("campaign:black-friday");
  });

  it("without a campaign: running slides, then defaults by priority", () => {
    expect(keys("2026-12-05T00:00:00Z")).toEqual([
      "slide:app",
      "slide:gift-guide",
      "slide:quiz",
      "slide:welcome",
    ]);
  });

  it("gives a campaign slide its landing page and button", () => {
    const [first] = heroSlides([bf], [], { now: new Date("2026-11-28T00:00:00Z") });
    expect(first).toMatchObject({
      href: "/pages/campaigns/black-friday",
      buttonLabel: "Shop the BLACK-FRIDAY offer",
      text: "25% off",
    });
  });

  it("drops a slide linking off the store or with its dates the wrong way round", () => {
    const bad = [
      slide("off", { link: "https://example.com" }),
      slide("protocol", { link: "//example.com" }),
      slide("backwards", {
        startsAt: "2026-12-02T00:00:00Z",
        endsAt: "2026-12-01T00:00:00Z",
      }),
    ];
    expect(heroSlides([], bad, { now: new Date("2026-12-01T12:00:00Z") })).toEqual([]);
  });

  it("gives a slide without a link no button", () => {
    const [only] = heroSlides([], [slide("app")], {
      now: new Date("2026-12-01T00:00:00Z"),
    });
    expect(only).toMatchObject({ href: null, buttonLabel: null });
  });
});

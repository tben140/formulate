import { describe, expect, it } from "vitest";

import { sizedImageUrl } from "./image-url";

const PACKSHOT =
  "https://cdn.shopify.com/s/files/1/1005/8196/6136/files/double-helix-magnesium-glycinate-packshot.png?v=1788033542";

describe("sizedImageUrl", () => {
  it("asks the CDN for the size, keeping the version parameter", () => {
    expect(sizedImageUrl(PACKSHOT, { width: 192, height: 192 })).toBe(
      `${PACKSHOT}&width=192&height=192&crop=center`,
    );
  });

  it("rounds up to a 64 px step, so nearby sizes share a cache entry", () => {
    // A 64 pt thumbnail at 3× (192) and at 2.75× (176) both ask for 192.
    expect(sizedImageUrl(PACKSHOT, { width: 176, height: 176 })).toContain("width=192");
    expect(sizedImageUrl(PACKSHOT, { width: 10 })).toContain("width=64");
  });

  it("leaves height and crop off when only a width is given", () => {
    const url = sizedImageUrl(PACKSHOT, { width: 1000 });
    expect(url).toContain("width=1024");
    expect(url).not.toContain("height=");
    expect(url).not.toContain("crop=");
  });

  it("replaces an existing size rather than adding a second", () => {
    const once = sizedImageUrl(PACKSHOT, { width: 128, height: 128 });
    const twice = sizedImageUrl(once, { width: 256, height: 256 });
    expect(new URL(twice).searchParams.getAll("width")).toEqual(["256"]);
  });

  it("leaves other hosts and unparseable strings alone", () => {
    expect(sizedImageUrl("https://example.com/a.png", { width: 100 })).toBe(
      "https://example.com/a.png",
    );
    expect(sizedImageUrl("not a url", { width: 100 })).toBe("not a url");
  });

  it("also rewrites a store's own /cdn/shop/ URLs", () => {
    expect(
      sizedImageUrl("https://formulate.myshopify.com/cdn/shop/files/a.png", {
        width: 64,
      }),
    ).toBe("https://formulate.myshopify.com/cdn/shop/files/a.png?width=64");
  });
});

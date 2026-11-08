import { describe, expect, it } from "vitest";

import { GALLERY_LIMIT, galleryAlt, galleryImages, galleryPosition } from "./gallery";

const image = (name: string, query = "") => ({
  url: `https://cdn.shopify.com/files/${name}.png${query}`,
  altText: null,
  width: 1254,
  height: 1254,
});

describe("galleryImages", () => {
  it("puts the featured image first, then the rest, each once", () => {
    const front = image("front");
    const back = image("back");
    const capsules = image("capsules");
    expect(
      galleryImages({
        featuredImage: back,
        images: { nodes: [front, back, capsules] },
      }).map((i) => i.url),
    ).toEqual([back.url, front.url, capsules.url]);
  });

  it("treats the same file with a different query string as the same image", () => {
    expect(
      galleryImages({
        featuredImage: image("front", "?v=1"),
        images: { nodes: [image("front", "?v=2"), image("back")] },
      }),
    ).toHaveLength(2);
  });

  it("copes with no images at all, and caps a long list", () => {
    expect(galleryImages({ featuredImage: null, images: null })).toEqual([]);
    const many = Array.from({ length: 14 }, (_, i) => image(`n${i}`));
    expect(galleryImages({ images: { nodes: many } })).toHaveLength(GALLERY_LIMIT);
  });
});

describe("labels", () => {
  it("counts from one", () => {
    expect(galleryPosition(0, 3)).toBe("Image 1 of 3");
  });

  it("prefers the merchant's alt text, else the title and position", () => {
    expect(galleryAlt({ url: "x", altText: "The tub, front" }, "Whey", 0, 3)).toBe(
      "The tub, front",
    );
    expect(galleryAlt({ url: "x", altText: " " }, "Whey", 1, 3)).toBe(
      "Whey, image 2 of 3",
    );
    expect(galleryAlt({ url: "x" }, "Whey", 0, 1)).toBe("Whey");
  });
});

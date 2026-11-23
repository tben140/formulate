import { describe, expect, it } from "vitest";

import { priorityIndex } from "./priority-image";

const image = { url: "https://cdn.shopify.com/a.jpg" };

describe("priorityIndex", () => {
  it("is the first card when it has an image", () => {
    expect(priorityIndex([{ featuredImage: image }, { featuredImage: image }])).toBe(0);
  });

  it("skips a first card without an image, so a photo still gets priority", () => {
    expect(priorityIndex([{ featuredImage: null }, { featuredImage: image }])).toBe(1);
  });

  it("skips search results that aren't products", () => {
    expect(priorityIndex([{ __typename: "Page" }, { featuredImage: image }])).toBe(1);
  });

  it("is -1 when no card has an image, or there are no cards", () => {
    expect(priorityIndex([{ featuredImage: null }])).toBe(-1);
    expect(priorityIndex([])).toBe(-1);
  });
});

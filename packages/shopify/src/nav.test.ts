import { describe, expect, it } from "vitest";

import { breadcrumbCollection, toNavLinks } from "./nav";

const item = (url: string | null, title = "Item") => ({ id: `id-${title}`, title, url });

describe("toNavLinks", () => {
  it("turns collection and product URLs on the store domain into app paths", () => {
    expect(
      toNavLinks([
        item("https://shop.myshopify.com/collections/gut-health", "Gut Health"),
        item("https://shop.myshopify.com/products/magnesium-glycinate", "Magnesium"),
      ]),
    ).toEqual([
      {
        id: "id-Gut Health",
        title: "Gut Health",
        kind: "collection",
        handle: "gut-health",
        path: "/collections/gut-health",
      },
      {
        id: "id-Magnesium",
        title: "Magnesium",
        kind: "product",
        handle: "magnesium-glycinate",
        path: "/products/magnesium-glycinate",
      },
    ]);
  });

  it("keeps store policies Shopify can serve, and drops unknown ones", () => {
    expect(
      toNavLinks([
        item("/policies/privacy-policy", "Privacy"),
        item("/policies/subscription-policy", "Subscriptions"),
        item("/policies/contact-information", "Contact"),
      ]).map((link) => [link.kind, link.path]),
    ).toEqual([
      ["policy", "/policies/privacy-policy"],
      ["policy", "/policies/subscription-policy"],
    ]);
  });

  it("accepts relative URLs, as the Admin API returns them", () => {
    expect(toNavLinks([item("/collections/performance")])[0]?.path).toBe(
      "/collections/performance",
    );
  });

  it("drops what a headless surface has no route for", () => {
    expect(
      toNavLinks([
        item("https://shop.myshopify.com/", "Home"),
        item("https://shop.myshopify.com/collections/all", "Catalog"),
        item("https://shop.myshopify.com/collections", "All collections"),
        item("https://shop.myshopify.com/pages/contact", "Contact"),
        item("https://shop.myshopify.com/collections/vendors?q=Acme", "Vendor"),
        item("https://example.com/blog/post", "External"),
        item(null, "No URL"),
      ]),
    ).toEqual([]);
  });

  it("ignores a query string or trailing slash on a collection", () => {
    expect(
      toNavLinks([item("/collections/best-sellers/?sort_by=price")])[0]?.handle,
    ).toBe("best-sellers");
  });

  it("returns nothing for a missing menu", () => {
    expect(toNavLinks(null)).toEqual([]);
    expect(toNavLinks(undefined)).toEqual([]);
  });
});

describe("breadcrumbCollection", () => {
  const nav = toNavLinks([
    item("/collections/best-sellers", "Best Sellers"),
    item("/collections/gut-health", "Gut Health"),
    item("/products/fibre", "Fibre"),
  ]);

  it("picks the first menu collection the product is in, in menu order", () => {
    expect(
      breadcrumbCollection([{ handle: "gut-health" }, { handle: "best-sellers" }], nav)
        ?.handle,
    ).toBe("best-sellers");
  });

  it("ignores collections that aren't in the menu", () => {
    expect(
      breadcrumbCollection([{ handle: "frontpage" }, { handle: "gut-health" }], nav)
        ?.handle,
    ).toBe("gut-health");
  });

  it("is null when none match, and never picks a product link", () => {
    expect(breadcrumbCollection([{ handle: "frontpage" }], nav)).toBeNull();
    expect(breadcrumbCollection([{ handle: "fibre" }], nav)).toBeNull();
  });
});

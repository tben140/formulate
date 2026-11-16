import type { ProductByHandleResult } from "@formulate/shopify";

import { absoluteUrl } from "./site";

type Product = NonNullable<ProductByHandleResult["product"]>;

/**
 * schema.org structured data for search engines, as plain objects.
 *
 * Web-only by design. See "Parity overrides" in the root AGENTS.md: a native
 * app has no crawlable page to describe. The theme gets the equivalent from
 * Shopify's own `structured_data` filter.
 */

/**
 * A Product with one Offer per variant.
 *
 * Each offer carries its own price and availability, because variants differ:
 * one strength of a product can be sold out while another is in stock, and a
 * single product-level offer would claim the wrong thing about one of them.
 * Every offer points at the product URL; the page does not select a variant
 * from the URL, so a `?variant=` link would promise something it can't do.
 *
 * Subscription prices are left out. Offers describe what anyone can buy
 * outright, and a plan price quoted as the product's price would mislead.
 */
export const productJsonLd = (product: Product) => {
  const url = absoluteUrl(`/products/${product.handle}`);
  const images = product.images.nodes.map((image) => image.url);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    url,
    ...(product.description ? { description: plainText(product.description) } : {}),
    ...(images.length > 0
      ? { image: images }
      : product.featuredImage
        ? { image: [product.featuredImage.url] }
        : {}),
    ...(product.vendor ? { brand: { "@type": "Brand", name: product.vendor } } : {}),
    offers: product.variants.nodes.map((variant) => ({
      "@type": "Offer",
      url,
      price: variant.price.amount,
      priceCurrency: variant.price.currencyCode,
      availability: variant.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(variant.sku ? { sku: variant.sku } : {}),
      // "Default Title" is Shopify's stand-in for "no options", not a name.
      ...(variant.title !== "Default Title" ? { name: variant.title } : {}),
    })),
  };
};

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export const breadcrumbJsonLd = (crumbs: readonly Crumb[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: absoluteUrl(crumb.path),
  })),
});

/**
 * JSON for a `<script type="application/ld+json">` body.
 *
 * ⚠️ `JSON.stringify` alone is not safe inside a script element. Product
 * titles and descriptions are merchant-entered text, and a description
 * containing `</script>` would close the element and let whatever follows run
 * as HTML. Escaping `<`, `>` and `&` as Unicode escapes keeps the JSON
 * identical to a parser and inert to the HTML one. U+2028 and U+2029 are
 * escaped too, because older JavaScript parsers treat them as line breaks.
 */
export const serialiseJsonLd = (data: unknown): string =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/**
 * Shopify's plain-text `description` with its seams repaired.
 *
 * The field is the HTML description with tags stripped, and paragraphs are
 * joined with nothing between them: "two strength options.This is a draft".
 * A full stop, question or exclamation mark followed directly by a capital is
 * where a paragraph ended.
 */
export const plainText = (text: string): string =>
  text
    .replace(/([.!?])(?=[A-Z])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

/** Trims text to a meta-description length at a word boundary. */
export const metaDescription = (text: string, max = 155): string => {
  const flat = plainText(text);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, "")}…`;
};

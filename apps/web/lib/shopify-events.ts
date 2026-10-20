import { createHmac, timingSafeEqual } from "node:crypto";

import { TAGS } from "./cache-tags";

/**
 * Shopify Events (SHO-171): checking a delivery came from Shopify, and turning
 * it into the cache tags to clear. Pure, so it's unit-tested; the route in
 * app/api/shopify-events only wires it to the request and `revalidateTag`.
 */

/**
 * Whether `Shopify-Hmac-Sha256` is the HMAC-SHA256 of the raw body under the
 * app's client secret. Constant-time, and false for anything malformed.
 */
export const isFromShopify = (
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean => {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
};

interface ProductData {
  readonly handle?: string | null;
  readonly collections?: {
    readonly nodes?: readonly { readonly handle?: string | null }[];
  } | null;
}

/** The `data` our subscriptions' queries return (shopify.app.toml [events]). */
export interface EventData {
  readonly product?: ProductData | null;
  readonly collection?: { readonly handle?: string | null } | null;
  readonly inventoryItem?: {
    readonly variant?: { readonly product?: ProductData | null } | null;
  } | null;
}

const productTags = (product: ProductData | null | undefined): string[] => {
  if (!product?.handle) return [];
  return [
    TAGS.product(product.handle),
    ...(product.collections?.nodes ?? [])
      .map((node) => node.handle)
      .filter((handle): handle is string => Boolean(handle))
      .map((handle) => TAGS.collection(handle)),
  ];
};

/**
 * The tags one delivery clears.
 *
 * - A product change clears the product page and its collections' listings.
 * - Inventory changes reach the product through the variant (sold out).
 * - A collection change clears that collection.
 * - A create or delete also clears the home page's collection cards and the
 *   sitemap. A delete carries no query data (the resource is gone), so its
 *   own page expires with the hourly backstop.
 */
export const tagsForDelivery = (
  topic: string,
  action: string,
  data: EventData | null | undefined,
): string[] => {
  const tags = new Set<string>();
  if (topic === "Product") productTags(data?.product).forEach((tag) => tags.add(tag));
  if (topic === "InventoryItem") {
    productTags(data?.inventoryItem?.variant?.product).forEach((tag) => tags.add(tag));
  }
  if (topic === "Collection") {
    if (data?.collection?.handle) tags.add(TAGS.collection(data.collection.handle));
    tags.add(TAGS.collections);
  }
  if (action === "create" || action === "delete") {
    tags.add(TAGS.collections);
    tags.add(TAGS.sitemap);
  }
  return [...tags];
};

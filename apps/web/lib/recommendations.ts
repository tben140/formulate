import {
  ProductRecommendationsQuery,
  selectCartSuggestions,
  type Cart,
  type CartSuggestion,
} from "@formulate/shopify";

import { storefront } from "./storefront";

/**
 * Suggestions for the cart drawer (SHO-116), fetched on the server beside the
 * cart itself so the drawer never shows a loading state for them.
 *
 * The source is the cart's **first line**, the top of the drawer. Shopify
 * returns cart lines newest first (observed on 2026-09-27: adding Marine
 * Collagen to a cart holding Creatine put it above Creatine), so in practice
 * this is the most recently added product, the one the shopper is thinking
 * about. It is also the same line on every surface, and still the same after a
 * reload, which "remember what was added last" would not be.
 *
 * Failures return no suggestions. They are an extra, and a Storefront hiccup
 * must never break the cart around them.
 */
export const getCartSuggestions = async (
  cart: Cart | null,
): Promise<CartSuggestion[]> => {
  const lines = cart?.lines.nodes ?? [];
  const source = lines[0]?.merchandise.product.id;
  if (!source) return [];

  const result = await storefront.request(ProductRecommendationsQuery, {
    productId: source,
  });
  if (!result.ok) return [];

  return selectCartSuggestions(
    result.data.productRecommendations,
    lines.map((line) => line.merchandise.product.id),
  );
};

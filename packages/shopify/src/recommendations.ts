import type { ProductRecommendationsQuery } from "./generated/graphql";

type Recommendation = ProductRecommendationsQuery["productRecommendations"] extends
  readonly (infer R)[] | null | undefined
  ? R
  : never;

/** How many suggestions a cart drawer shows. A drawer, not a collection page. */
export const RECOMMENDATION_LIMIT = 3;

export type CartSuggestion =
  /** One variant, in stock: added straight from the drawer. */
  | { readonly kind: "add"; readonly product: Recommendation; readonly variantId: string }
  /** Several variants: the shopper has to choose, so this links to the product. */
  | { readonly kind: "view"; readonly product: Recommendation };

/**
 * The cart-drawer suggestion rule, shared by web and mobile. The theme applies
 * the same rule in Liquid (sections/cart-recommendations.liquid).
 *
 * Shared as a rule, not a fetch: the theme gets its list from the Ajax API and
 * the headless surfaces from the Storefront API, and SHO-116 asks for no
 * abstraction over that difference.
 *
 * - Anything already in the cart is dropped. A drawer suggesting what the
 *   shopper just added reads as broken.
 * - Anything unavailable is dropped. A suggestion that can't be bought is
 *   worse than none.
 * - A product with one variant can be added in one tap. One with several
 *   can't be, because picking a variant for the shopper would be a guess, so
 *   it links to its page instead.
 */
export const selectCartSuggestions = (
  recommendations: readonly Recommendation[] | null | undefined,
  cartProductIds: readonly string[],
  limit = RECOMMENDATION_LIMIT,
): CartSuggestion[] => {
  const inCart = new Set(cartProductIds);

  return (recommendations ?? [])
    .filter((product) => product.availableForSale && !inCart.has(product.id))
    .slice(0, limit)
    .map((product): CartSuggestion => {
      const [only, second] = product.variants.nodes;
      return only && !second && only.availableForSale
        ? { kind: "add", product, variantId: only.id }
        : { kind: "view", product };
    });
};

import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

export const GIFT_MESSAGE = "Free gift";

type Line = CartInput["cart"]["lines"][number];

/** The variant a line's product gives free: the variant's own, else the product's. */
const giftOf = (line: Line): string | null =>
  line.merchandise.__typename === "ProductVariant"
    ? (line.merchandise.freeGift?.value ??
      line.merchandise.product.freeGift?.value ??
      null)
    : null;

/**
 * Free gifts: 100% off one unit of a product's gift, set in its "Free gift"
 * field (custom.free_gift, on the product or a variant).
 *
 * Only when the gift is **nested under** that product in the cart, which is
 * how the storefronts add it (packages/shopify/src/free-gift.ts). A gift added
 * on its own, or nested under a product that doesn't give it, pays its price:
 * the discount can't be had without buying the product. One per product line,
 * whatever its quantity, matching what the storefronts add.
 */
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const byId = new Map(input.cart.lines.map((line) => [line.id, line]));
  // One free gift per product line, even if two gift lines sit under it.
  const giftedParents = new Set<string>();
  const targets = input.cart.lines.flatMap((line) => {
    const parent = line.parentRelationship && byId.get(line.parentRelationship.parent.id);
    if (!parent || line.merchandise.__typename !== "ProductVariant") return [];
    if (giftOf(parent) !== line.merchandise.id || giftedParents.has(parent.id)) return [];
    giftedParents.add(parent.id);
    return [{ cartLine: { id: line.id, quantity: 1 } }];
  });

  if (targets.length === 0) return { operations: [] };

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            { message: GIFT_MESSAGE, targets, value: { percentage: { value: 100 } } },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

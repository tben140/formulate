/**
 * Free gifts: a product (or one variant) gives a gift, set in its "Free gift"
 * field (custom.free_gift). Shared by web and the app; restated in Liquid and
 * product-form.js for the theme.
 *
 * - **The gift is added nested under the product's cart line,** so Shopify
 *   shows it beneath the product and removes it with it. Only a nested gift is
 *   free: the free-gift discount Function (apps/shopify-app) takes 100% off one
 *   unit when its parent gives it.
 * - **One per product line,** whatever the quantity: adding the product again
 *   finds its gift already there.
 * - **Gifts are one-time lines,** so under a subscription they ship with the
 *   first order only.
 * - **A gift that's out of stock is skipped,** and the product sells without it.
 *
 * ⚠️ "Free" has to be true (UK CMA pricing guidance; the FTC's guide on "free"
 * offers): the gift isn't recouped in the product's price, and the condition
 * ("while stocks last") is stated where it's offered.
 */

/** A gift, as the product query reads it. */
export interface GiftVariantLike {
  readonly id: string;
  readonly availableForSale: boolean;
  readonly product: { readonly title: string };
  /** The variant's image, for the gift's card on the product page. */
  readonly image?: { readonly url: string; readonly altText?: string | null } | null;
}

interface GiftField {
  readonly reference?: GiftVariantLike | Record<string, never> | null;
}

const isGift = (value: unknown): value is GiftVariantLike =>
  typeof value === "object" && value !== null && "id" in value;

const asGift = (field: GiftField | null | undefined): GiftVariantLike | null =>
  isGift(field?.reference) ? field.reference : null;

/**
 * The gift for this selection: the variant's own, else the product's, and only
 * while it's in stock. Null when there's none.
 */
export const freeGiftFor = (
  product: { readonly freeGift?: GiftField | null },
  variant?: { readonly freeGift?: GiftField | null } | null,
): GiftVariantLike | null => {
  const gift = asGift(variant?.freeGift) ?? asGift(product.freeGift);
  return gift?.availableForSale ? gift : null;
};

/**
 * The offer in one sentence, for screen readers and anywhere the gift's card
 * can't show: "Free Double Helix Shaker with this product, while stocks last".
 */
export const freeGiftMessage = (gift: GiftVariantLike): string =>
  `Free ${gift.product.title} with this product, while stocks last`;

/** The gift card's words, the same on every surface. */
export const FREE_GIFT_LABEL = "Free gift";
export const FREE_GIFT_CONDITION = "With this product, while stocks last";
export const FREE_GIFT_PRICE = "Free";

/** What these helpers read from a cart line (CartFields). */
export interface NestedLineLike {
  readonly id: string;
  readonly merchandise: { readonly id: string };
  readonly parentRelationship?: { readonly parent: { readonly id: string } } | null;
}

/**
 * A line nested under another: in this store, a free gift. Takes any line:
 * Shopify's cart lines are a union, and only one member has a parent.
 */
export const isNestedLine = (line: object): boolean =>
  "parentRelationship" in line && Boolean(line.parentRelationship);

/**
 * The cart line to add for a product line's gift, or null when it already has
 * it (one per line) or there's no gift.
 */
export const giftLineToAdd = (
  lines: readonly NestedLineLike[],
  parentLineId: string | null | undefined,
  gift: { readonly id: string } | null,
): { merchandiseId: string; quantity: 1; parent: { lineId: string } } | null => {
  if (!gift || !parentLineId) return null;
  const present = lines.some(
    (line) =>
      line.parentRelationship?.parent.id === parentLineId &&
      line.merchandise.id === gift.id,
  );
  return present
    ? null
    : { merchandiseId: gift.id, quantity: 1, parent: { lineId: parentLineId } };
};

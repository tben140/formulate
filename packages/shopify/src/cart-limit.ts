/**
 * The most of any one product an order may hold, as the store enforces it.
 *
 * ⚠️ Mirrors MAX_PER_PRODUCT in the Shopify Function
 * (apps/shopify-app/extensions/cart-limits), which is the real rule: it runs
 * inside Shopify and refuses a cart over the limit whatever a surface does.
 * These helpers only stop the controls before that point, so a shopper never
 * meets the refusal by accident. Change both together.
 */
export const MAX_PER_PRODUCT = 6;

interface LimitLine {
  readonly id: string;
  readonly quantity: number;
  readonly merchandise: { readonly product?: { readonly id: string } | null };
}

const productId = (line: LimitLine): string | undefined => line.merchandise.product?.id;

/** How many of a product the cart already holds, across all its lines. */
export const quantityOfProduct = (lines: readonly LimitLine[], product: string): number =>
  lines.reduce(
    (sum, line) => (productId(line) === product ? sum + line.quantity : sum),
    0,
  );

/**
 * The most this line can be set to: the limit minus the same product's other
 * lines (another size, or the subscription next to a one-off).
 */
export const maxQuantityForLine = (
  lines: readonly LimitLine[],
  lineId: string,
): number => {
  const line = lines.find((candidate) => candidate.id === lineId);
  const product = line ? productId(line) : undefined;
  if (!line || !product) return MAX_PER_PRODUCT;
  const others = quantityOfProduct(lines, product) - line.quantity;
  return Math.max(0, MAX_PER_PRODUCT - others);
};

/** The same words the Function uses, so every surface says one thing. */
export const limitMessage = (title: string): string =>
  `You can buy up to ${MAX_PER_PRODUCT} of ${title} in one order.`;

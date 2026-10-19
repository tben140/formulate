import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

/**
 * The most of any one product a single order may hold.
 *
 * Counted per product, not per line: the same supplement as a one-off and as
 * a subscription, or in two sizes, adds up. A Function runs inside Shopify, so
 * the limit holds for carts and checkout on web, the app and the theme. It
 * doesn't run for POS, orders created through the Admin API, or subscription
 * renewals (Shopify's Function compatibility table).
 */
export const MAX_PER_PRODUCT = 6;

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  // Per product: its total and its title.
  const products = new Map<string, { title: string; total: number }>();

  input.cart.lines.forEach((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return;
    const { id, title } = line.merchandise.product;
    const seen = products.get(id);
    if (seen) seen.total += line.quantity;
    else products.set(id, { title, total: line.quantity });
  });

  const errors: ValidationError[] = [...products.values()]
    .filter(({ total }) => total > MAX_PER_PRODUCT)
    .map(({ title }) => ({
      message: `You can buy up to ${MAX_PER_PRODUCT} of ${title} in one order.`,
      // `$.cart`: Shopify supports no per-line target for validation errors,
      // so the message shows as a cart error. The text names the product.
      target: "$.cart",
    }));

  return { operations: [{ validationAdd: { errors } }] };
}

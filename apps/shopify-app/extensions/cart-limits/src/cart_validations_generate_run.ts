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
 * the limit holds on web, the app and the theme alike, including checkout,
 * where no storefront code runs.
 */
export const MAX_PER_PRODUCT = 6;

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  // Per product: its total, its title, and the first line it appears on, so
  // the message sits next to that product in the cart and at checkout.
  const products = new Map<string, { title: string; total: number; firstLine: number }>();

  input.cart.lines.forEach((line, index) => {
    if (line.merchandise.__typename !== "ProductVariant") return;
    const { id, title } = line.merchandise.product;
    const seen = products.get(id);
    if (seen) seen.total += line.quantity;
    else products.set(id, { title, total: line.quantity, firstLine: index });
  });

  const errors: ValidationError[] = [...products.values()]
    .filter(({ total }) => total > MAX_PER_PRODUCT)
    .map(({ title, firstLine }) => ({
      message: `You can buy up to ${MAX_PER_PRODUCT} of ${title} in one order.`,
      target: `$.cart.lines[${firstLine}].quantity`,
    }));

  return { operations: [{ validationAdd: { errors } }] };
}

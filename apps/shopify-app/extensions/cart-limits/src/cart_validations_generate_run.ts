import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

/**
 * Two rules for every cart, on every surface:
 *
 * - at most `MAX_PER_PRODUCT` of any one product;
 * - a Your Daily Pack line carries exactly as many ingredients as its size
 *   (`isValidBlend`, docs/blend.md).
 *
 * The most of any one product a single order may hold.
 *
 * Counted per product, not per line: the same supplement as a one-off and as
 * a subscription, or in two sizes, adds up. A Function runs inside Shopify, so
 * the limit holds for carts and checkout on web, the app and the theme. It
 * doesn't run for POS, orders created through the Admin API, or subscription
 * renewals (Shopify's Function compatibility table).
 */
export const MAX_PER_PRODUCT = 6;

/** An ingredient code as `packages/shopify/src/blend.ts` writes it. */
const BLEND_CODE = /^[a-z0-9]{1,12}$/;

/**
 * Whether a pack line's ingredients match its size: exactly that many codes,
 * each well formed, none twice. Web, the app and the theme already check this
 * before adding, but the Storefront API is public, so a cart built by hand
 * could skip them. Which codes exist isn't checked here: the range lives in
 * metaobjects a Function can't read.
 */
export const isValidBlend = (blend: string | null | undefined, size: number): boolean => {
  const codes = (blend ?? "").split(",").map((code) => code.trim());
  return (
    codes.length === size &&
    codes.every((code) => BLEND_CODE.test(code)) &&
    new Set(codes).size === codes.length
  );
};

/**
 * The Function's entry point: one cart-level error per product over
 * `MAX_PER_PRODUCT`, and one per daily pack whose `_blend` doesn't fit its
 * `double_helix.blend_size`. An empty list lets the cart through.
 */
export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  // Per product: its total and its title.
  const products = new Map<string, { title: string; total: number }>();
  // Pack lines whose ingredients don't match their size, by product title.
  const badBlends = new Set<string>();

  input.cart.lines.forEach((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return;
    const { id, title } = line.merchandise.product;
    const size = Number(line.merchandise.blendSize?.value);
    if (Number.isInteger(size) && size > 0 && !isValidBlend(line.blend?.value, size))
      badBlends.add(`${title} (${size} ingredients)`);
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

  for (const pack of badBlends)
    errors.push({
      message: `${pack} doesn't have its ingredients chosen. Remove it and build it again.`,
      target: "$.cart",
    });

  return { operations: [{ validationAdd: { errors } }] };
}

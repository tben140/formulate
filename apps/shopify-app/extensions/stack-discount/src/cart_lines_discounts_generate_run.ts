import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

/** How many different products make a stack. */
export const STACK_SIZE = 3;

/** The discount on one-off items in a stack, as a percentage. */
export const STACK_PERCENT = 10;

export const STACK_MESSAGE = `Build your stack: ${STACK_PERCENT}% off`;

/**
 * "Build your stack": 10% off when an order holds 3 or more different
 * products.
 *
 * Subscriptions count towards the three but aren't discounted again: they
 * already carry their subscribe-and-save price, and stacking two discounts on
 * one line isn't the offer. So the order discount excludes subscription lines.
 */
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Order)) {
    return { operations: [] };
  }

  const products = new Set<string>();
  const subscriptionLines: string[] = [];
  const nestedLines: string[] = [];

  for (const line of input.cart.lines) {
    // Free gifts and other add-ons sit under the product they came with. They
    // aren't a product the shopper chose, so they can't complete a stack, and
    // they're never discounted again (free-gift makes a gift free).
    if (line.parentRelationship) {
      nestedLines.push(line.id);
      continue;
    }
    if (line.merchandise.__typename === "ProductVariant") {
      products.add(line.merchandise.product.id);
    }
    // Subscriptions only: pre-orders and try-before-you-buy also use selling
    // plans, but deliver once, so they keep the 10%.
    if (line.sellingPlanAllocation?.sellingPlan.recurringDeliveries) {
      subscriptionLines.push(line.id);
    }
  }

  const oneOffLines =
    input.cart.lines.length - subscriptionLines.length - nestedLines.length;
  if (products.size < STACK_SIZE || oneOffLines === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: STACK_MESSAGE,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [...subscriptionLines, ...nestedLines],
                  },
                },
              ],
              value: { percentage: { value: STACK_PERCENT } },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}

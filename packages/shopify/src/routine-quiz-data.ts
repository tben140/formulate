import type { RoutineGoalsQuery } from "./generated/graphql";
import { purchasableAllocations } from "./product-selection";
import {
  dietsFrom,
  formatKind,
  frequencyInDays,
  monthlyPlan,
  type RoutineGoal,
  type RoutineProduct,
} from "./routine-quiz";

type GoalNode = RoutineGoalsQuery["metaobjects"]["nodes"][number];
type ProductNode = NonNullable<GoalNode["products"]>["references"] extends infer R
  ? R extends { nodes: Array<infer N> }
    ? N
    : never
  : never;

/**
 * One product as the scorer needs it, or null if it can't be offered (not a
 * product, or no variant).
 *
 * The plan comes only from app-owned groups (`purchasableAllocations`), the
 * same rule as the product page, or the quiz could sell a subscription nothing
 * fulfils.
 */
export const toRoutineProduct = (node: ProductNode): RoutineProduct | null => {
  if (!node || !("id" in node)) return null;
  // The first size that's in stock, so one sold-out size (Magnesium
  // Glycinate's 200 mg, at times) doesn't hide the whole product. If none is,
  // the first: the product then counts as unavailable.
  const variant =
    node.variants.nodes.find((candidate) => candidate.availableForSale) ??
    node.variants.nodes[0];
  if (!variant) return null;

  const allocations = purchasableAllocations(
    node.sellingPlanGroups.nodes,
    variant.sellingPlanAllocations.nodes,
  );
  const plan = monthlyPlan(
    allocations
      .map((allocation) => ({
        id: allocation.sellingPlan.id,
        frequencyDays: frequencyInDays(
          allocation.sellingPlan.options.find(({ name }) => /frequency/i.test(name ?? ""))
            ?.value ?? "",
        ),
        perDeliveryPrice: Number(
          allocation.priceAdjustments[0]?.perDeliveryPrice.amount ?? NaN,
        ),
      }))
      .filter((choice) => Number.isFinite(choice.perDeliveryPrice)),
  );

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    available: node.availableForSale && variant.availableForSale,
    suits: dietsFrom(node.tags),
    format: formatKind(node.tags),
    variantId: variant.id,
    sellingPlanId: plan?.id ?? null,
    planDays: plan?.frequencyDays ?? null,
    monthlyPrice: plan?.monthlyPrice ?? Number(variant.price.amount),
    currencyCode: variant.price.currencyCode,
    image: node.featuredImage
      ? { url: node.featuredImage.url, altText: node.featuredImage.altText ?? null }
      : null,
  };
};

/**
 * The quiz's goals from Shopify's response. A goal without a key, a label or
 * any offerable product is left out, so a half-filled metaobject in the admin
 * doesn't show an empty choice.
 */
export const toRoutineGoals = (data: RoutineGoalsQuery): RoutineGoal[] =>
  data.metaobjects.nodes.flatMap((node) => {
    const key = node.key?.value?.trim();
    const label = node.label?.value?.trim();
    const products = (node.products?.references?.nodes ?? [])
      .map(toRoutineProduct)
      .filter((product): product is RoutineProduct => product !== null);
    return key && label && products.length > 0 ? [{ key, label, products }] : [];
  });

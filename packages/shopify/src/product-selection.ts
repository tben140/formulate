/**
 * Pure helpers for turning a shopper's choices into something the cart accepts.
 *
 * Everything here is a plain function over plain data — no React, no platform.
 * That is deliberate: `apps/web` runs this in a Server Component, `apps/mobile`
 * runs it in a hook, and `apps/theme` does the equivalent in Liquid. The rules
 * are the same in all three; only the rendering differs.
 *
 * See docs/adr/0005-parity-means-design-not-data.md.
 */

/** One axis of a variant's identity, e.g. `{ name: "Size", value: "M" }`. */
export interface SelectedOption {
  readonly name: string;
  readonly value: string;
}

interface VariantLike {
  readonly selectedOptions: readonly SelectedOption[];
  readonly availableForSale: boolean;
}

/**
 * Each constraint below asks for exactly the fields its function reads, and
 * nothing more — so callers can pass whatever shape they already have rather
 * than reconstructing a full group.
 */
interface AppOwnedLike {
  /**
   * The id of the app that owns this group, or null if nothing owns it.
   *
   * Named `appName`, but Shopify returns the numeric app id as a string —
   * `"294517"` for Recharge on this store, not a human-readable name. Do not
   * display it, and do not match on a hard-coded value: the id differs per app
   * and the point is only whether SOMETHING owns the group.
   */
  readonly appName?: string | null;
}

interface SellingPlanGroupLike extends AppOwnedLike {
  readonly sellingPlans: { readonly nodes: readonly { readonly id: string }[] };
}

interface AllocationLike {
  readonly sellingPlan: { readonly id: string };
}

/**
 * Finds the variant matching every selected option.
 *
 * Order-independent and exact: a variant matches only when it has the same
 * number of options and each one agrees. Partial selections return undefined,
 * which is the correct state for a half-filled picker — the add-to-cart button
 * should be disabled, not guessing.
 */
export const findVariantByOptions = <T extends VariantLike>(
  variants: readonly T[],
  selected: readonly SelectedOption[],
): T | undefined =>
  variants.find(
    (variant) =>
      variant.selectedOptions.length === selected.length &&
      variant.selectedOptions.every((option) =>
        selected.some(
          (choice) => choice.name === option.name && choice.value === option.value,
        ),
      ),
  );

/**
 * The options to preselect when a product page first renders.
 *
 * Prefers the first variant that is actually purchasable, so a shopper does not
 * land on a sold-out selection and have to hunt for one that works. Falls back
 * to the first variant when everything is sold out, because rendering no
 * selection at all is worse — the page would have no price.
 */
export const defaultSelectedOptions = <T extends VariantLike>(
  variants: readonly T[],
): readonly SelectedOption[] =>
  (variants.find((variant) => variant.availableForSale) ?? variants[0])
    ?.selectedOptions ?? [];

/**
 * Replaces one axis of a selection, leaving the others alone.
 *
 * The resulting combination may not exist as a variant — for a product with
 * gaps in its option matrix, that is unavoidable and honest. Callers should
 * feed the result to `findVariantByOptions` and handle `undefined` rather than
 * silently snapping to a nearby variant, which loses the shopper's intent.
 */
export const withOption = (
  selected: readonly SelectedOption[],
  name: string,
  value: string,
): readonly SelectedOption[] =>
  selected.some((option) => option.name === name)
    ? selected.map((option) => (option.name === name ? { name, value } : option))
    : [...selected, { name, value }];

/**
 * Whether a selling plan group is managed by an installed app.
 *
 * ⚠️ **This filter is load-bearing, and omitting it ships a broken purchase.**
 *
 * A Shopify store can carry selling plan groups that no app manages. On this
 * store, `selling-plans-ski-wax` has five groups and only ONE is real:
 *
 * | Group                  | `appName`  | Managed by |
 * | ---------------------- | ---------- | ---------- |
 * | Prepaid                | `null`     | nothing    |
 * | Subscription           | `null`     | nothing    |
 * | Try Before You Buy     | `null`     | nothing    |
 * | Preorder               | `null`     | nothing    |
 * | Delivery every 30 days | `"294517"` | Recharge   |
 *
 * The first four are Shopify's seed data. They look completely legitimate in
 * the API — real names, real options, real plans with real price adjustments —
 * and a variant will happily accept them at `cartLinesAdd`. Checkout completes.
 * But no app is watching, so nothing ever charges or ships again.
 *
 * Rendering every group you find is therefore not a cosmetic bug: it lets a
 * shopper buy a subscription that will never be fulfilled.
 */
export const hasOwningApp = (group: AppOwnedLike): boolean => Boolean(group.appName);

/**
 * The selling plan groups safe to offer a shopper.
 *
 * Returns an empty array for a product with no app-managed plans, which callers
 * should treat as "one-time purchase only" rather than as an error.
 */
export const purchasableSellingPlanGroups = <T extends AppOwnedLike>(
  groups: readonly T[],
): readonly T[] => groups.filter(hasOwningApp);

/**
 * The selling plans a given variant can actually be bought on, safely.
 *
 * Two different lists have to be intersected, and neither alone is sufficient:
 *
 *   - **The product's groups** say who owns each plan, but say nothing about
 *     whether a particular variant is sold on it.
 *   - **The variant's allocations** say what this variant is sold on, and at
 *     what price, but name only the plan — never its group.
 *
 * So an allocation cannot be judged on its own. This maps each allocation back
 * to its group through the plan ids and keeps only those whose group has an
 * owning app.
 *
 * On the demo store the numbers make the point: `selling-plans-ski-wax`
 * declares five groups, its variant allocates three of them, and exactly one
 * of those three is real. Offering the variant's allocations unfiltered would
 * present three subscription options where only one works.
 */
export const purchasableAllocations = <A extends AllocationLike>(
  groups: readonly SellingPlanGroupLike[],
  allocations: readonly A[],
): readonly A[] => {
  const ownedPlanIds = new Set(
    purchasableSellingPlanGroups(groups).flatMap((group) =>
      group.sellingPlans.nodes.map((plan) => plan.id),
    ),
  );

  return allocations.filter((allocation) => ownedPlanIds.has(allocation.sellingPlan.id));
};

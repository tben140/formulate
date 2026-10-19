/**
 * Reads a Recharge selling plan into words for checkout.
 *
 * Checkout extensions only learn a line's selling plan id and whether it
 * repeats. The frequency and discount live on the plan itself, which the
 * extensions fetch from the Storefront API. Recharge writes the frequency as
 * an option, "Order Frequency and Unit: 30-day" on our store.
 */
export interface PlanFacts {
  /** "every 30 days", "every month", or null if the plan doesn't say. */
  readonly every: string | null;
  /** The percentage off every delivery, or null if there isn't one. */
  readonly percentOff: number | null;
}

export interface PlanInput {
  readonly options: readonly { readonly name: string; readonly value: string }[];
  readonly priceAdjustments: readonly {
    readonly orderCount: number | null;
    readonly adjustmentValue: {
      readonly __typename: string;
      readonly adjustmentPercentage?: number;
    };
  }[];
}

const UNITS: Record<string, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

/** "30-day", "4 weeks", "1-month" → "every 30 days", "every 4 weeks", "every month". */
export const describeFrequency = (value: string): string | null => {
  const match = /^\s*(\d+)\s*[- ]?\s*(day|week|month)s?\s*$/i.exec(value);
  if (!match) return null;
  const count = Number(match[1]);
  const [one, many] = UNITS[match[2]!.toLowerCase()]!;
  if (count < 1) return null;
  return count === 1 ? `every ${one}` : `every ${count} ${many}`;
};

export const readPlan = (plan: PlanInput): PlanFacts => {
  const frequency = plan.options.find(({ name }) => /frequency/i.test(name));
  // Only a discount that applies to every delivery (orderCount null); a
  // first-order-only discount would make "off every delivery" untrue.
  const everyDelivery = plan.priceAdjustments.find(
    ({ orderCount, adjustmentValue }) =>
      orderCount === null &&
      adjustmentValue.__typename === "SellingPlanPercentagePriceAdjustment",
  );
  return {
    every: frequency ? describeFrequency(frequency.value) : null,
    percentOff: everyDelivery?.adjustmentValue.adjustmentPercentage ?? null,
  };
};

/** The Storefront API query both extensions use, one request for every line. */
export const PLANS_QUERY = `query SubscriptionPlans($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      sellingPlanAllocations(first: 20) {
        nodes {
          sellingPlan {
            id
            options { name value }
            priceAdjustments {
              orderCount
              adjustmentValue {
                __typename
                ... on SellingPlanPercentagePriceAdjustment { adjustmentPercentage }
              }
            }
          }
        }
      }
    }
  }
}`;

export interface PlansQueryData {
  readonly nodes: readonly ({
    readonly id?: string;
    readonly sellingPlanAllocations?: {
      readonly nodes: readonly {
        readonly sellingPlan: PlanInput & { readonly id: string };
      }[];
    };
  } | null)[];
}

/** Every plan in the response, by selling plan id. */
export const plansById = (data: PlansQueryData | undefined): Map<string, PlanFacts> => {
  const plans = new Map<string, PlanFacts>();
  for (const variant of data?.nodes ?? []) {
    for (const { sellingPlan } of variant?.sellingPlanAllocations?.nodes ?? []) {
      plans.set(sellingPlan.id, readPlan(sellingPlan));
    }
  }
  return plans;
};

/** One sentence per subscription, as both extensions show it. */
export const describeSubscription = (
  title: string,
  facts: PlanFacts | undefined,
): string => {
  const every = facts?.every ? `, delivered ${facts.every}` : ", delivered on repeat";
  const off = facts?.percentOff ? ` with ${facts.percentOff}% off each delivery` : "";
  return `${title}${every}${off}.`;
};

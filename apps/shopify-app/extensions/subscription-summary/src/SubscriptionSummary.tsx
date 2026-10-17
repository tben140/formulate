import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  describeSubscription,
  plansById,
  PLANS_QUERY,
  type PlanFacts,
  type PlansQueryData,
} from "../../../shared/subscription-plan";

/**
 * "Your subscriptions", under the items at checkout.
 *
 * Says, before the shopper pays, what repeats, how often and at what
 * discount, and where to skip, pause or cancel. Shown only when the order
 * has a subscription. Facts only: no product benefits (docs/claims-wording.md).
 */
export default async () => {
  render(<SubscriptionSummary />, document.body);
};

const SubscriptionSummary = () => {
  const subscriptions = shopify.lines.value.filter(
    (line) =>
      line.merchandise.type === "variant" &&
      line.merchandise.sellingPlan?.recurringDeliveries,
  );
  const variantIds = [...new Set(subscriptions.map((line) => line.merchandise.id))];
  const [plans, setPlans] = useState<Map<string, PlanFacts>>(new Map());

  useEffect(() => {
    if (variantIds.length === 0) return;
    void shopify
      .query<PlansQueryData>(PLANS_QUERY, { variables: { ids: variantIds } })
      .then(({ data }) => setPlans(plansById(data)))
      // Without the plan details the summary still says what repeats.
      .catch(() => undefined);
  }, [variantIds.join()]);

  if (subscriptions.length === 0) return null;

  const manageUrl = String(shopify.settings.value.manage_url ?? "").trim();

  return (
    <s-section heading="Your subscriptions">
      <s-stack gap="small-200">
        {subscriptions.map((line) => {
          const { merchandise } = line;
          if (merchandise.type !== "variant") return null;
          const facts = merchandise.sellingPlan
            ? plans.get(merchandise.sellingPlan.id)
            : undefined;
          return (
            <s-text key={line.id}>
              {describeSubscription(merchandise.title, facts)}
            </s-text>
          );
        })}
        <s-text color="subdued">
          Each delivery is charged when it's sent. You can skip, pause or cancel any time
          {manageUrl.startsWith("https://") ? (
            <>
              {" "}
              from <s-link href={manageUrl}>your subscriptions page</s-link>.
            </>
          ) : (
            "."
          )}
        </s-text>
      </s-stack>
    </s-section>
  );
};

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
 * "What happens next", on the thank-you page.
 *
 * Dispatch, the tracking email, and, for subscriptions, that the next
 * delivery follows on its own and can be changed. Facts only: no product
 * benefits (docs/claims-wording.md).
 */
export default async () => {
  render(<OrderNextSteps />, document.body);
};

const OrderNextSteps = () => {
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
      .catch(() => undefined);
  }, [variantIds.join()]);

  const dispatch = String(shopify.settings.value.dispatch_text ?? "").trim();
  const manageUrl = String(shopify.settings.value.manage_url ?? "").trim();

  return (
    <s-section heading="What happens next">
      <s-stack gap="base">
        <s-stack gap="small-200">
          {dispatch ? <s-text>{dispatch}</s-text> : null}
          <s-text>We'll email you a tracking link when your order is on its way.</s-text>
        </s-stack>

        {subscriptions.length > 0 ? (
          <s-stack gap="small-200">
            <s-heading>Your subscriptions</s-heading>
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
              The next delivery follows on its own. You can skip, pause or cancel any time
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
        ) : null}
      </s-stack>
    </s-section>
  );
};

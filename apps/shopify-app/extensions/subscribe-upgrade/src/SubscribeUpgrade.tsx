import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  UPGRADE_QUERY,
  appliedOffer,
  switchResult,
  unpricedTerms,
  upgradeOffer,
  upgradeTerms,
  type SwitchResult,
  type UpgradeOffer,
  type UpgradeQueryData,
} from "../../../shared/subscribe-upgrade";

/**
 * "Subscribe & save x%" under a one-time line at checkout, the saving read
 * from the plan: one tap sets the line's selling plan, and the renewal terms
 * are stated beside the button before it's pressed (California's ARL; the
 * UK's DMCC rules from 2027). Undo is offered straight after, as Recharge's
 * own block does.
 *
 * The plan is read when checkout loads, and again after the tap: if it
 * changed in between (a new percentage in Recharge), Shopify charges the new
 * one, so the shopper is told the new terms before paying.
 */
export default async () => {
  render(<SubscribeUpgrade />, document.body);
};

const SubscribeUpgrade = () => {
  const line = shopify.target.value;
  const merchandise = line.merchandise;
  const variantId = merchandise.type === "variant" ? merchandise.id : null;
  const subscribed = Boolean(
    merchandise.type === "variant" && merchandise.sellingPlan?.recurringDeliveries,
  );
  const [offer, setOffer] = useState<UpgradeOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after a switch made here, so the shopper can take it back.
  const [switched, setSwitched] = useState<SwitchResult | null>(null);

  const readVariant = async () =>
    variantId
      ? (
          await shopify.query<UpgradeQueryData>(UPGRADE_QUERY, {
            variables: { ids: [variantId] },
          })
        ).data?.nodes[0]
      : undefined;

  useEffect(() => {
    void readVariant()
      .then((variant) => setOffer(upgradeOffer(variant)))
      // No offer is the safe failure: the line stays as it is.
      .catch(() => setOffer(null));
  }, [variantId]);

  // A nested line (a free gift) or a line checkout won't let us change.
  if (
    !offer ||
    line.parentRelationship ||
    !shopify.instructions.value.lines.canUpdateCartLine
  ) {
    return null;
  }

  const failed = "That didn't work. Your order hasn't changed.";

  const change = async (sellingPlanId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const result = await shopify.applyCartLinesChange({
        type: "updateCartLine",
        id: line.id,
        sellingPlanId,
      });
      if (result.type === "error") {
        setError(failed);
        return;
      }
      if (sellingPlanId === null) {
        setSwitched(null);
        return;
      }
      // The plan as Shopify applied it, not as it was when checkout loaded.
      const applied = await readVariant()
        .then((variant) => appliedOffer(variant, sellingPlanId))
        .catch(() => null);
      const outcome = switchResult(offer, applied);
      // Undo brings the button back, with the plan as it is now.
      if (outcome.kind === "changed") setOffer(outcome.offer);
      setSwitched(outcome);
    } catch {
      // A rejected change is a failed one: say so, and leave the button usable.
      setError(failed);
    } finally {
      setBusy(false);
    }
  };

  const perDelivery = (plan: UpgradeOffer) =>
    shopify.i18n.formatCurrency(Number(plan.price.amount) * line.quantity, {
      currency: plan.price.currencyCode,
    });

  if (subscribed) {
    return switched ? (
      <s-stack gap="small-500">
        {switched.kind === "same" ? (
          <s-text color="subdued">
            Subscribed, {switched.offer.every}, {switched.offer.percentOff}% off each
            delivery.
          </s-text>
        ) : switched.kind === "changed" ? (
          <s-text>
            This plan changed while checkout was open: it's now{" "}
            {switched.offer.percentOff}% off each delivery.{" "}
            {upgradeTerms(switched.offer, perDelivery(switched.offer))}
          </s-text>
        ) : (
          <s-text color="subdued">
            Subscribed, delivered {offer.every}. {unpricedTerms(offer.every)}
          </s-text>
        )}
        <s-button variant="secondary" loading={busy} onClick={() => void change(null)}>
          Switch back to one-time
        </s-button>
        {error ? <s-text tone="critical">{error}</s-text> : null}
      </s-stack>
    ) : null;
  }

  return (
    <s-stack gap="small-500">
      <s-button
        variant="secondary"
        loading={busy}
        onClick={() => void change(offer.sellingPlanId)}
        accessibilityLabel={`Subscribe and save ${offer.percentOff}% on ${merchandise.type === "variant" ? merchandise.title : "this item"}, delivered ${offer.every}`}
      >
        Subscribe & save {offer.percentOff}%, delivered {offer.every}
      </s-button>
      <s-text color="subdued">{upgradeTerms(offer, perDelivery(offer))}</s-text>
      {error ? <s-text tone="critical">{error}</s-text> : null}
    </s-stack>
  );
};

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import {
  UPGRADE_QUERY,
  upgradeOffer,
  upgradeTerms,
  type UpgradeOffer,
  type UpgradeQueryData,
} from "../../../shared/subscribe-upgrade";

/**
 * "Subscribe & save 15%" under a one-time line at checkout: one tap sets the
 * line's selling plan, and the renewal terms are stated beside the button
 * before it's pressed (California's ARL; the UK's DMCC rules from 2027).
 * Undo is offered straight after, as Recharge's own block does.
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
  const [switched, setSwitched] = useState(false);

  useEffect(() => {
    if (!variantId) return;
    void shopify
      .query<UpgradeQueryData>(UPGRADE_QUERY, { variables: { ids: [variantId] } })
      .then(({ data }) => setOffer(upgradeOffer(data?.nodes[0])))
      // No offer is the safe failure: the line stays as it is.
      .catch(() => setOffer(null));
  }, [variantId]);

  // A nested line (a free gift) or a line checkout won't let us change.
  if (!offer || line.parentRelationship || !shopify.instructions.value.lines.canUpdateCartLine) {
    return null;
  }

  const change = async (sellingPlanId: string | null) => {
    setBusy(true);
    setError(null);
    const result = await shopify.applyCartLinesChange({
      type: "updateCartLine",
      id: line.id,
      sellingPlanId,
    });
    setBusy(false);
    if (result.type === "error") {
      setError("That didn't work. Your order hasn't changed.");
      return;
    }
    setSwitched(sellingPlanId !== null);
  };

  if (subscribed) {
    return switched ? (
      <s-stack gap="small-500">
        <s-text color="subdued">
          Subscribed, {offer.every}, {offer.percentOff}% off each delivery.
        </s-text>
        <s-button variant="secondary" loading={busy} onClick={() => void change(null)}>
          Switch back to one-time
        </s-button>
      </s-stack>
    ) : null;
  }

  const perDelivery = shopify.i18n.formatCurrency(
    Number(offer.price.amount) * line.quantity,
    { currency: offer.price.currencyCode },
  );

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
      <s-text color="subdued">{upgradeTerms(offer, perDelivery)}</s-text>
      {error ? <s-text tone="critical">{error}</s-text> : null}
    </s-stack>
  );
};

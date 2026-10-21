"use client";

import { subscribeOfferLabel, type SubscribeOffer } from "@formulate/shopify";
import { useActionState } from "react";

import { subscribeCartLine } from "@/app/actions/cart";

/**
 * "Subscribe & save" on a one-time cart line (packages/shopify cart-offers).
 *
 * Its own component for the error: if Shopify refuses the plan, the line
 * stays one-time and the shopper is told why, announced as an alert.
 */
export const SubscribeLineForm = ({
  lineId,
  productTitle,
  offer,
}: {
  readonly lineId: string;
  readonly productTitle: string;
  readonly offer: SubscribeOffer;
}) => {
  const [state, action, pending] = useActionState(subscribeCartLine, { error: null });

  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="sellingPlanId" value={offer.sellingPlanId} />
      <button
        type="submit"
        aria-disabled={pending || undefined}
        className="text-xs font-medium text-brand-600 underline underline-offset-2 aria-disabled:cursor-wait"
      >
        {subscribeOfferLabel(offer)}
        <span className="sr-only">
          {" "}
          on {productTitle}, {offer.planName}
        </span>
      </button>
      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
};

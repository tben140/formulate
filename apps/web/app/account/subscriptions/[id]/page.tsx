import {
  chargeDelivery,
  chargesForSubscription,
  chargeTotal,
  deliveryFrequency,
  deliveryPrice,
  formatDeliveryDate,
  subscriptionStatusLabel,
} from "@formulate/recharge";
import { formatMoney } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ChangeMessage, SubscriptionControls } from "@/components/subscription-controls";
import { requireCustomerTokens } from "@/lib/customer-account";
import { loadSubscription } from "@/lib/recharge";

export const metadata: Metadata = {
  title: "Subscription",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
  /** The outcome of the last change (see app/actions/subscription.ts). */
  readonly searchParams: Promise<{ done?: string; error?: string; charge?: string }>;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-foreground-muted">{label}</dt>
    <dd className="text-right">{value}</dd>
  </div>
);

/**
 * One subscription, its queued deliveries, and the changes the customer can
 * make. Another customer's id is a 404, as for orders: it isn't in their list.
 */
const SubscriptionPage = async ({ params, searchParams }: PageProps) => {
  const { id } = await params;
  const { done, error, charge } = await searchParams;
  const path = `/account/subscriptions/${id}`;
  const tokens = await requireCustomerTokens(path);
  const data = await loadSubscription(tokens, id);

  if (data.kind === "not-found") notFound();
  if (data.kind !== "ready") {
    return (
      <p
        role={data.kind === "error" ? "alert" : undefined}
        className="text-foreground-muted"
      >
        {data.kind === "error"
          ? "We couldn't load this subscription just now. Please try again in a moment."
          : "Subscriptions can't be shown on this deployment yet."}
      </p>
    );
  }

  const { subscription } = data;
  const price = deliveryPrice(subscription);
  const next = formatDeliveryDate(subscription.next_charge_scheduled_at);
  const upcoming = chargesForSubscription(data.upcoming, subscription.id);

  return (
    <article className="max-w-2xl">
      <Breadcrumbs
        items={[
          { label: "Your account", href: "/account" },
          { label: "Subscriptions", href: "/account/subscriptions" },
          { label: subscription.product_title },
        ]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">
        {subscription.product_title}
      </h1>
      <ChangeMessage
        subscriptionId={subscription.id}
        done={done}
        error={error}
        chargeId={charge}
      />
      {subscription.variant_title ? (
        <p className="mt-1 text-foreground-muted">{subscription.variant_title}</p>
      ) : null}

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <Row label="Status" value={subscriptionStatusLabel(subscription.status)} />
        <Row label="Delivery" value={deliveryFrequency(subscription)} />
        {subscription.blend_label ? (
          <Row label="Blend" value={subscription.blend_label} />
        ) : null}
        <Row label="Quantity" value={String(subscription.quantity)} />
        {price ? <Row label="Price per delivery" value={formatMoney(price)} /> : null}
        {subscription.status === "active" && next ? (
          <Row label="Next delivery" value={next} />
        ) : null}
      </dl>

      {upcoming.length > 0 ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">Upcoming</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
            {upcoming.map((charge) => {
              const delivery = chargeDelivery(charge);
              return (
                <li key={charge.id} className="flex justify-between gap-4 py-3">
                  <span>
                    {formatDeliveryDate(charge.scheduled_at) ?? "Date to be confirmed"}
                    <span className="block text-foreground-muted">
                      {Number(delivery.amount) === 0
                        ? "Free delivery"
                        : `Includes ${formatMoney(delivery)} delivery`}
                    </span>
                  </span>
                  <span className="font-mono">{formatMoney(chargeTotal(charge))}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <SubscriptionControls
        subscription={subscription}
        blendOptions={data.blendOptions}
      />
    </article>
  );
};

export { SubscriptionPage as default };

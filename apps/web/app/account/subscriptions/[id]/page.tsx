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
import { requireCustomerTokens } from "@/lib/customer-account";
import { loadSubscription } from "@/lib/recharge";

export const metadata: Metadata = {
  title: "Subscription",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-foreground-muted">{label}</dt>
    <dd className="text-right">{value}</dd>
  </div>
);

/**
 * One subscription and its queued deliveries. Another customer's id is a 404,
 * as for orders: Recharge scopes the session to this customer.
 */
const SubscriptionPage = async ({ params }: PageProps) => {
  const { id } = await params;
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
      {subscription.variant_title ? (
        <p className="mt-1 text-foreground-muted">{subscription.variant_title}</p>
      ) : null}

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <Row label="Status" value={subscriptionStatusLabel(subscription.status)} />
        <Row label="Delivery" value={deliveryFrequency(subscription)} />
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

      <p className="mt-8 text-sm text-foreground-muted">
        Changing, pausing or cancelling a subscription is coming soon. For now, use the
        link in any of our subscription emails.
      </p>
    </article>
  );
};

export { SubscriptionPage as default };

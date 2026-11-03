import {
  chargeDelivery,
  chargeTotal,
  deliveryFrequency,
  deliveryPrice,
  formatDeliveryDate,
  subscriptionStatusLabel,
} from "@formulate/recharge";
import { formatMoney } from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireCustomerTokens } from "@/lib/customer-account";
import { loadPortal } from "@/lib/recharge";

export const metadata: Metadata = {
  title: "Your subscriptions",
  robots: { index: false, follow: false },
};

const Message = ({ children, alert }: { children: React.ReactNode; alert?: boolean }) => (
  <p role={alert ? "alert" : undefined} className="mt-4 text-foreground-muted">
    {children}
  </p>
);

/**
 * The subscription portal, read-only for now (SHO-72): what's subscribed, how
 * often, and the next deliveries with what they'll cost. Changes (skip, swap,
 * pause, cancel) are SHO-73 and SHO-74.
 */
const SubscriptionsPage = async () => {
  const tokens = await requireCustomerTokens("/account/subscriptions");
  const portal = await loadPortal(tokens);

  return (
    <div className="max-w-3xl">
      <Breadcrumbs
        items={[{ label: "Your account", href: "/account" }, { label: "Subscriptions" }]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">Your subscriptions</h1>

      {portal.kind === "not-connected" ? (
        <Message>Subscriptions can&apos;t be shown on this deployment yet.</Message>
      ) : portal.kind === "error" ? (
        <Message alert>
          We couldn&apos;t load your subscriptions just now. Please try again in a moment.
        </Message>
      ) : portal.kind === "no-subscriptions" ? (
        <Message>
          You don&apos;t have any subscriptions yet. Choose &ldquo;Subscribe&rdquo; on a
          product to have it delivered on a schedule, for less.{" "}
          <Link href="/" className="text-brand-600 underline underline-offset-4">
            Browse products
          </Link>
        </Message>
      ) : (
        <>
          <h2 className="mt-8 text-xl font-semibold">Next deliveries</h2>
          {portal.upcoming.length === 0 ? (
            <Message>Nothing is scheduled.</Message>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {portal.upcoming.map((charge) => {
                const delivery = chargeDelivery(charge);
                return (
                  <li key={charge.id} className="flex justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {formatDeliveryDate(charge.scheduled_at) ??
                          "Date to be confirmed"}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        {charge.line_items
                          .map((line) => `${line.quantity} × ${line.title}`)
                          .join(", ")}
                        {" · "}
                        {Number(delivery.amount) === 0
                          ? "Free delivery"
                          : `Delivery ${formatMoney(delivery)}`}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono">
                      {formatMoney(chargeTotal(charge))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-10 text-xl font-semibold">Subscriptions</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {portal.subscriptions.map((subscription) => {
              const price = deliveryPrice(subscription);
              const next = formatDeliveryDate(subscription.next_charge_scheduled_at);
              return (
                <li key={subscription.id}>
                  <Link
                    href={`/account/subscriptions/${subscription.id}`}
                    className="flex justify-between gap-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {subscription.quantity > 1 ? `${subscription.quantity} × ` : ""}
                        {subscription.product_title}
                        {subscription.variant_title
                          ? ` (${subscription.variant_title})`
                          : ""}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        {subscriptionStatusLabel(subscription.status)} ·{" "}
                        {deliveryFrequency(subscription)}
                        {subscription.status === "active" && next
                          ? ` · Next ${next}`
                          : ""}
                      </p>
                    </div>
                    {price ? (
                      <p className="shrink-0 font-mono">{formatMoney(price)}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export { SubscriptionsPage as default };

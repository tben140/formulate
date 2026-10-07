import {
  CUSTOMER_ORDER_QUERY,
  customerAccountRequest,
  describeCustomerAccountError,
  formatMoney,
  formatOrderDate,
  orderGid,
  orderStatusLabel,
  type CustomerOrderResult,
  type MoneyLike,
} from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { customerAccountConfig, requireCustomerTokens } from "@/lib/customer-account";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

const TotalRow = ({
  label,
  money,
  strong,
}: {
  label: string;
  money: MoneyLike | null;
  strong?: boolean;
}) =>
  money ? (
    <div className={`flex justify-between py-1 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(money)}</dd>
    </div>
  ) : null;

/**
 * One of the buyer's orders.
 *
 * Another buyer's order id gives a 404, not a 403: the Customer Account API
 * returns null for an order that isn't theirs, and saying "this exists but
 * isn't yours" would confirm the id to someone guessing.
 */
const OrderPage = async ({ params }: PageProps) => {
  const { id } = await params;
  const gid = orderGid(id);
  if (!gid) notFound();

  const path = `/account/orders/${id}`;
  const tokens = await requireCustomerTokens(path);
  const result = await customerAccountRequest<CustomerOrderResult>(
    customerAccountConfig,
    tokens.accessToken,
    CUSTOMER_ORDER_QUERY,
    { id: gid },
  );

  if (!result.ok) {
    if (result.error.kind === "http" && result.error.status === 401) {
      redirect(`/account/refresh?return_to=${encodeURIComponent(path)}`);
    }
    console.error(describeCustomerAccountError(result.error));
    return (
      <p role="alert" className="text-foreground-muted">
        We couldn&apos;t load this order just now. Please try again.
      </p>
    );
  }

  const { order } = result.data;
  if (!order) notFound();

  const status = [
    orderStatusLabel(order.financialStatus),
    orderStatusLabel(order.fulfillmentStatus),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="max-w-2xl">
      <Breadcrumbs
        items={[
          { label: "Your account", href: "/account" },
          { label: `Order ${order.name}` },
        ]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">Order {order.name}</h1>
      <p className="mt-1 text-foreground-muted">
        Placed {formatOrderDate(order.processedAt)}
        {status ? ` · ${status}` : ""}
      </p>

      <h2 className="sr-only">Items</h2>
      <ul className="mt-6 divide-y divide-border border-y border-border">
        {order.lineItems.nodes.map((line) => (
          <li key={line.id} className="flex justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{line.title}</p>
              <p className="text-sm text-foreground-muted">
                {line.variantTitle ? `${line.variantTitle} · ` : ""}Quantity{" "}
                {line.quantity}
              </p>
            </div>
            {line.totalPrice ? (
              <p className="tabular-nums">{formatMoney(line.totalPrice)}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className="sr-only">Totals</h2>
      <dl className="mt-4 ml-auto max-w-xs text-sm">
        <TotalRow label="Subtotal" money={order.subtotal} />
        <TotalRow label="Delivery" money={order.totalShipping} />
        <TotalRow label="Tax" money={order.totalTax} />
        <TotalRow label="Total" money={order.totalPrice} strong />
      </dl>
    </article>
  );
};

export { OrderPage as default };

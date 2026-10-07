import {
  CUSTOMER_ORDERS_QUERY,
  customerAccountRequest,
  describeCustomerAccountError,
  formatMoney,
  formatOrderDate,
  orderPathId,
  orderStatusLabel,
  type CustomerOrdersResult,
} from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  customerAccountConfig,
  isCustomerAccountConfigured,
  requireCustomerTokens,
} from "@/lib/customer-account";

/**
 * Personal pages are never indexed, on any deployment: they'd only ever show
 * a crawler the sign-in redirect, and the URL says nothing worth listing.
 */
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<{ error?: string }>;
}

/** How many recent orders to show. History beyond that is a later ticket. */
const ORDER_LIMIT = 20;

const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="max-w-xl">
    <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
    <div className="mt-2 text-foreground-muted">{children}</div>
  </div>
);

/**
 * The signed-in buyer's account: who they are and their recent orders
 * (SHO-70). Signed out, it sends them to Shopify's sign-in and back here.
 */
const AccountPage = async ({ searchParams }: PageProps) => {
  // Explains rather than redirecting: /account/login would only send the
  // buyer back here, and that loop is what an unconfigured preview would do.
  if (!isCustomerAccountConfigured) {
    return (
      <Notice title="Accounts aren't available here">
        <p>Sign-in hasn&apos;t been set up on this deployment yet.</p>
      </Notice>
    );
  }

  // After a failed or cancelled sign-in. Shown instead of retrying
  // automatically, which would bounce straight back to Shopify.
  const { error } = await searchParams;
  if (error) {
    return (
      <Notice title="You're not signed in">
        <p role="alert">
          Sign-in didn&apos;t complete. It may have been cancelled, or taken too long.
        </p>
        <Link
          href="/account/login"
          className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700"
        >
          Try again
        </Link>
      </Notice>
    );
  }

  const tokens = await requireCustomerTokens("/account");
  const result = await customerAccountRequest<CustomerOrdersResult>(
    customerAccountConfig,
    tokens.accessToken,
    CUSTOMER_ORDERS_QUERY,
    { first: ORDER_LIMIT },
  );

  if (!result.ok) {
    // 401 before the token's own expiry means Shopify ended the session
    // (signed out elsewhere, or revoked). A refresh settles which.
    if (result.error.kind === "http" && result.error.status === 401) {
      redirect("/account/refresh?return_to=%2Faccount");
    }
    console.error(describeCustomerAccountError(result.error));
    return (
      <Notice title="Your account">
        <p role="alert">We couldn&apos;t load your account just now. Please try again.</p>
      </Notice>
    );
  }

  const { customer } = result.data;
  const orders = customer.orders.nodes;
  const email = customer.emailAddress?.emailAddress;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {customer.firstName ? `Hello, ${customer.firstName}` : "Your account"}
          </h1>
          {email ? (
            <p className="mt-1 text-foreground-muted">Signed in as {email}</p>
          ) : null}
        </div>
        <form action="/account/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Sign out
          </button>
        </form>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-foreground-muted">
          No orders yet.{" "}
          <Link href="/" className="text-brand-600 underline underline-offset-4">
            Start shopping
          </Link>
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {orders.map((order) => {
            const pathId = orderPathId(order.id);
            const status = [
              orderStatusLabel(order.financialStatus),
              orderStatusLabel(order.fulfillmentStatus),
            ]
              .filter(Boolean)
              .join(" · ");
            const items = order.lineItems.nodes
              .map((line) => `${line.quantity} × ${line.title}`)
              .join(", ");

            return (
              <li
                key={order.id}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {pathId ? (
                      <Link
                        href={`/account/orders/${pathId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        Order {order.name}
                      </Link>
                    ) : (
                      `Order ${order.name}`
                    )}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {formatOrderDate(order.processedAt)}
                    {status ? ` · ${status}` : ""}
                  </p>
                  {items ? <p className="mt-1 truncate text-sm">{items}</p> : null}
                </div>
                <p className="font-medium tabular-nums">
                  {formatMoney(order.totalPrice)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export { AccountPage as default };

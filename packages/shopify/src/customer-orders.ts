import type { MoneyLike } from "./format-money";

/**
 * Order history from the Customer Account API (SHO-70).
 *
 * ⚠️ Hand-typed, not generated. Codegen runs against the **Storefront**
 * schema, and this is a different API with a different schema. Both queries
 * were validated against the Customer Account schema (2026-10-06) with
 * Shopify's validator. A second codegen project is the right fix once there are
 * more than these two; for two queries it would be more config than code.
 */

export interface CustomerOrderLine {
  readonly id: string;
  readonly title: string;
  readonly quantity: number;
  readonly variantTitle: string | null;
}

export interface CustomerOrderSummary {
  readonly id: string;
  /** The buyer-facing number, e.g. "#1001". */
  readonly name: string;
  readonly processedAt: string;
  readonly financialStatus: string | null;
  readonly fulfillmentStatus: string;
  readonly totalPrice: MoneyLike;
  readonly lineItems: { readonly nodes: readonly CustomerOrderLine[] };
}

export interface CustomerOrdersResult {
  readonly customer: {
    readonly id: string;
    readonly firstName: string | null;
    readonly emailAddress: { readonly emailAddress: string | null } | null;
    readonly orders: { readonly nodes: readonly CustomerOrderSummary[] };
  };
}

export const CUSTOMER_ORDERS_QUERY = /* GraphQL */ `
  query CustomerOrders($first: Int!) {
    customer {
      id
      firstName
      emailAddress {
        emailAddress
      }
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          processedAt
          financialStatus
          fulfillmentStatus
          totalPrice {
            amount
            currencyCode
          }
          lineItems(first: 10) {
            nodes {
              id
              title
              quantity
              variantTitle
            }
          }
        }
      }
    }
  }
`;

export interface CustomerOrderDetail {
  readonly id: string;
  readonly name: string;
  readonly processedAt: string;
  readonly financialStatus: string | null;
  readonly fulfillmentStatus: string;
  readonly subtotal: MoneyLike | null;
  readonly totalShipping: MoneyLike;
  readonly totalTax: MoneyLike | null;
  readonly totalPrice: MoneyLike;
  readonly lineItems: {
    readonly nodes: readonly (CustomerOrderLine & {
      readonly totalPrice: MoneyLike | null;
    })[];
  };
}

export interface CustomerOrderResult {
  /** Null for an id that isn't this buyer's: the API scopes it, not us. */
  readonly order: CustomerOrderDetail | null;
}

export const CUSTOMER_ORDER_QUERY = /* GraphQL */ `
  query CustomerOrder($id: ID!) {
    order(id: $id) {
      id
      name
      processedAt
      financialStatus
      fulfillmentStatus
      subtotal {
        amount
        currencyCode
      }
      totalShipping {
        amount
        currencyCode
      }
      totalTax {
        amount
        currencyCode
      }
      totalPrice {
        amount
        currencyCode
      }
      lineItems(first: 50) {
        nodes {
          id
          title
          quantity
          variantTitle
          totalPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const ORDER_GID_PREFIX = "gid://shopify/Order/";

/**
 * The numeric part of an order gid, for a URL (`/account/orders/1234`).
 * Null for anything that isn't an order gid.
 */
export const orderPathId = (gid: string): string | null => {
  if (!gid.startsWith(ORDER_GID_PREFIX)) return null;
  const id = gid.slice(ORDER_GID_PREFIX.length);
  return /^\d+$/.test(id) ? id : null;
};

/**
 * The gid back from a URL segment. Digits only, so a crafted segment can't
 * smuggle a different resource type into the query.
 */
export const orderGid = (pathId: string): string | null =>
  /^\d+$/.test(pathId) ? `${ORDER_GID_PREFIX}${pathId}` : null;

/**
 * "PAID" → "Paid", "PARTIALLY_REFUNDED" → "Partially refunded". The API's
 * enum values, made readable without a lookup table that drifts as Shopify
 * adds states.
 */
export const orderStatusLabel = (status: string | null): string | null => {
  if (!status) return null;
  const words = status.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * An order date as a UK shopper reads it ("6 October 2026"), in UK time
 * whatever the server's or phone's zone. Shared so web and the app can't
 * disagree about which day an order was placed.
 */
export const formatOrderDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(iso));

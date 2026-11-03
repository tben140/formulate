import type { RechargeCharge, RechargeSubscription } from "@formulate/recharge";
import type {
  CustomerOrderDetail,
  CustomerOrderResult,
  CustomerOrdersResult,
} from "@formulate/shopify";
import { useSyncExternalStore } from "react";

import { isExpoGo } from "./expo-go";

/**
 * A preview of the signed-in Account screens with sample data, for Expo Go
 * only.
 *
 * Expo Go can't sign in: Shopify returns native sign-ins to
 * `shop.<shop id>.app://`, and Expo Go only receives `exp://`. A development
 * build needs an Apple Developer account, which this project doesn't have yet
 * (SHO-86). So without this, the Account, order and subscription screens can
 * never be seen on a phone at all.
 *
 * ⚠️ Development only. `__DEV__` is false in every release build, so the
 * preview and its sample data are stripped from anything shipped. The data
 * mirrors the real API shapes (the store's catalogue and its real test order
 * #1009) but is plainly labelled as a sample on screen.
 */
export const canPreviewAccount = __DEV__ && isExpoGo;

let previewing = false;
const listeners = new Set<() => void>();

export const isPreviewingAccount = (): boolean => canPreviewAccount && previewing;

export const setPreviewingAccount = (next: boolean): void => {
  previewing = canPreviewAccount && next;
  listeners.forEach((listener) => listener());
};

/** Re-renders when the preview is switched on or off. */
export const usePreviewingAccount = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isPreviewingAccount,
    isPreviewingAccount,
  );

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

const SAMPLE_ORDER_DETAILS: readonly CustomerOrderDetail[] = [
  {
    id: "gid://shopify/Order/7463804830008",
    name: "#1009",
    processedAt: "2026-10-06T16:13:54Z",
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    subtotal: gbp("49.46"),
    totalShipping: gbp("0.00"),
    totalTax: gbp("0.00"),
    totalPrice: gbp("49.46"),
    lineItems: {
      nodes: [
        {
          id: "sample-line-1",
          title: "Daily Multivitamin",
          quantity: 1,
          variantTitle: null,
          totalPrice: gbp("13.56"),
        },
        {
          id: "sample-line-2",
          title: "Citicoline",
          quantity: 1,
          variantTitle: null,
          totalPrice: gbp("25.95"),
        },
        {
          id: "sample-line-3",
          title: "Vitamin D3",
          quantity: 1,
          variantTitle: "25 µg",
          totalPrice: gbp("9.95"),
        },
      ],
    },
  },
  {
    id: "gid://shopify/Order/7356423897400",
    name: "#1004",
    processedAt: "2026-08-07T19:51:08Z",
    financialStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    subtotal: gbp("33.90"),
    totalShipping: gbp("3.95"),
    totalTax: gbp("0.00"),
    totalPrice: gbp("37.85"),
    lineItems: {
      nodes: [
        {
          id: "sample-line-4",
          title: "Magnesium Glycinate",
          quantity: 1,
          variantTitle: "200 mg",
          totalPrice: gbp("17.95"),
        },
        {
          id: "sample-line-5",
          title: "Omega-3 Fish Oil",
          quantity: 1,
          variantTitle: null,
          totalPrice: gbp("15.95"),
        },
      ],
    },
  },
];

export const SAMPLE_ORDERS: CustomerOrdersResult = {
  customer: {
    id: "gid://shopify/Customer/sample",
    firstName: "Sam",
    emailAddress: { emailAddress: "sam@example.com" },
    orders: {
      nodes: SAMPLE_ORDER_DETAILS.map((order) => ({
        id: order.id,
        name: order.name,
        processedAt: order.processedAt,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalPrice: order.totalPrice,
        lineItems: {
          nodes: order.lineItems.nodes.map(({ id, title, quantity, variantTitle }) => ({
            id,
            title,
            quantity,
            variantTitle,
          })),
        },
      })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

/** The sample order for an id from a URL, or `order: null` as the API answers. */
export const sampleOrder = (gid: string): CustomerOrderResult => ({
  order: SAMPLE_ORDER_DETAILS.find((order) => order.id === gid) ?? null,
});

const subscription = (
  overrides: Partial<RechargeSubscription> &
    Pick<RechargeSubscription, "id" | "product_title">,
): RechargeSubscription => ({
  status: "active",
  variant_title: null,
  price: "13.56",
  quantity: 1,
  order_interval_frequency: 30,
  order_interval_unit: "day",
  next_charge_scheduled_at: "2026-11-05",
  presentment_currency: "GBP",
  is_skippable: true,
  is_swappable: true,
  cancelled_at: null,
  created_at: "2026-10-06T16:14:04+00:00",
  ...overrides,
});

export const SAMPLE_PORTAL: {
  readonly subscriptions: readonly RechargeSubscription[];
  readonly upcoming: readonly RechargeCharge[];
} = {
  subscriptions: [
    subscription({ id: 891037192, product_title: "Daily Multivitamin" }),
    subscription({
      id: 891037300,
      product_title: "Omega-3 Fish Oil",
      price: "13.56",
      order_interval_frequency: 60,
      next_charge_scheduled_at: "2026-12-05",
    }),
    subscription({
      id: 860000001,
      product_title: "Lion's Mane Mushroom",
      price: "18.66",
      status: "cancelled",
      next_charge_scheduled_at: null,
      cancelled_at: "2026-09-01T10:00:00+00:00",
      created_at: "2026-08-01T10:00:00+00:00",
    }),
  ],
  upcoming: [
    {
      id: 1946419139,
      status: "queued",
      scheduled_at: "2026-11-05",
      subtotal_price: "13.56",
      total_price: "17.51",
      currency: "GBP",
      line_items: [
        {
          purchase_item_id: 891037192,
          title: "Daily Multivitamin",
          variant_title: null,
          quantity: 1,
          total_price: "13.56",
        },
      ],
      shipping_lines: [{ title: "Standard delivery", price: "3.95" }],
    },
    {
      id: 1946419200,
      status: "queued",
      scheduled_at: "2026-12-05",
      subtotal_price: "13.56",
      total_price: "17.51",
      currency: "GBP",
      line_items: [
        {
          purchase_item_id: 891037300,
          title: "Omega-3 Fish Oil",
          variant_title: null,
          quantity: 1,
          total_price: "13.56",
        },
      ],
      shipping_lines: [{ title: "Standard delivery", price: "3.95" }],
    },
  ],
};

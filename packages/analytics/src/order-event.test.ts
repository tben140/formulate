import { describe, expect, it } from "vitest";

import { orderCompletedEvent, orderEventUuid, type WebhookOrder } from "./order-event";
import { CART_ATTRIBUTES, PRODUCT_EVENTS } from "./product-analytics";

const order = (attributes: Record<string, string>): WebhookOrder => ({
  id: 6500000000001,
  created_at: "2026-10-28T19:40:00+00:00",
  currency: "GBP",
  total_price: "39.85",
  note_attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
  line_items: [{ quantity: 2 }, { quantity: 1 }],
});

describe("orderEventUuid", () => {
  it("is a valid UUID, the same every time for an order", () => {
    const id = orderEventUuid("6500000000001");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(orderEventUuid("6500000000001")).toBe(id);
  });

  it("differs between orders", () => {
    expect(orderEventUuid("6500000000001")).not.toBe(orderEventUuid("6500000000002"));
  });
});

describe("orderCompletedEvent", () => {
  it("credits the order to the visitor whose cart it was", () => {
    const event = orderCompletedEvent(
      order({
        [CART_ATTRIBUTES.distinctId]: "web-visitor-id",
        [CART_ATTRIBUTES.surface]: "web",
      }),
      "phc_test",
    );
    expect(event).toEqual({
      api_key: "phc_test",
      event: PRODUCT_EVENTS.orderCompleted,
      uuid: orderEventUuid("6500000000001"),
      distinct_id: "web-visitor-id",
      timestamp: "2026-10-28T19:40:00.000Z",
      properties: {
        order_id: "6500000000001",
        item_count: 3,
        order_value: 39.85,
        currency: "GBP",
        surface: "web",
        $lib: "formulate-webhook",
      },
    });
  });

  it("sends nothing for a cart without an analytics id: no consent", () => {
    expect(orderCompletedEvent(order({}), "phc_test")).toBeNull();
    expect(
      orderCompletedEvent(order({ [CART_ATTRIBUTES.surface]: "web" }), "phc_test"),
    ).toBeNull();
  });

  it("calls an unknown surface the theme's", () => {
    const event = orderCompletedEvent(
      order({ [CART_ATTRIBUTES.distinctId]: "x", [CART_ATTRIBUTES.surface]: "kiosk" }),
      "phc_test",
    );
    expect(event?.properties.surface).toBe("theme");
  });
});

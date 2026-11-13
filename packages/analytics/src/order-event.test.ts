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
  const EVENT_ID = "0f9b6c1e-2d3a-8b4c-9d5e-6f7a8b9c0d1e";

  it("counts the order anonymously: no visitor id, no order id, no person", () => {
    const event = orderCompletedEvent(
      {
        ...order({
          [CART_ATTRIBUTES.distinctId]: "web-visitor-id",
          [CART_ATTRIBUTES.surface]: "web",
        }),
        source_name: "web",
      },
      "phc_test",
      EVENT_ID,
    );
    expect(event).toEqual({
      api_key: "phc_test",
      event: PRODUCT_EVENTS.orderCompleted,
      uuid: EVENT_ID,
      distinct_id: EVENT_ID,
      timestamp: "2026-10-28T19:40:00.000Z",
      properties: {
        item_count: 3,
        order_value: 39.85,
        currency: "GBP",
        surface: "web",
        source_name: "web",
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: "formulate-webhook",
      },
    });
    expect(JSON.stringify(event)).not.toContain("web-visitor-id");
    expect(JSON.stringify(event)).not.toContain("6500000000001");
  });

  it("counts an untagged cart's order too, as the theme's", () => {
    const event = orderCompletedEvent(order({}), "phc_test", EVENT_ID);
    expect(event.properties).toMatchObject({ surface: "theme", source_name: null });
  });

  it("calls an unknown surface the theme's", () => {
    const event = orderCompletedEvent(
      order({ [CART_ATTRIBUTES.surface]: "kiosk" }),
      "phc_test",
      EVENT_ID,
    );
    expect(event.properties.surface).toBe("theme");
  });
});

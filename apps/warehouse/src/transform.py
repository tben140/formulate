"""
Pure functions the loader notebooks share: query building and row shaping.

No Spark and no network here, so they run under plain `python -m unittest`
(apps/warehouse/tests). The notebooks do the fetching and the writing.

⚠️ What may reach the warehouse is decided here. The workspace is in the US
(AWS us-east-2), so nothing that identifies a person directly is loaded: no
names, emails, phone numbers, addresses or IP addresses. Visitor ids are
PostHog's anonymous ids; Shopify customer ids are hashed with a secret salt.
See apps/warehouse/AGENTS.md.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import datetime
from typing import Any, Iterable, Mapping, Sequence

# --- PostHog -----------------------------------------------------------------

#: The shared event vocabulary (packages/analytics/src/product-analytics.ts),
#: plus PostHog's own page and screen views. Anything else is not loaded.
POSTHOG_EVENTS: tuple[str, ...] = (
    "$pageview",
    "$screen",
    "product_viewed",
    "variant_selected",
    "selling_plan_selected",
    "product_added_to_cart",
    "cart_viewed",
    "checkout_started",
    "experiment_viewed",
)

#: Column name -> HogQL expression. Only these properties are loaded; `$ip`
#: and the rest of PostHog's automatic properties never are.
POSTHOG_COLUMNS: tuple[tuple[str, str], ...] = (
    ("uuid", "toString(uuid)"),
    ("event", "event"),
    ("distinct_id", "distinct_id"),
    ("timestamp", "toString(timestamp)"),
    ("surface", "properties.surface"),
    ("session_id", "properties.$session_id"),
    ("pathname", "properties.$pathname"),
    ("screen_name", "properties.$screen_name"),
    ("experiment_key", "properties.experiment_key"),
    ("variation_id", "properties.variation_id"),
    ("product_id", "properties.product_id"),
    ("variant_id", "properties.variant_id"),
    ("quantity", "properties.quantity"),
    ("price", "properties.price"),
    ("cart_value", "properties.cart_value"),
    ("currency", "properties.currency"),
    ("selling_plan", "properties.selling_plan"),
    ("has_subscription", "properties.has_subscription"),
)

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")


def _iso(value: str) -> str:
    """A timestamp safe to put inside a HogQL string literal."""
    if not _ISO.match(value):
        raise ValueError(f"Not an ISO timestamp: {value!r}")
    return value


def hogql_events_query(start: str, end: str, limit: int, offset: int) -> str:
    """
    One page of events in [start, end), oldest first.

    Timestamps are validated rather than escaped: they come from the notebook,
    but a malformed one should fail loudly, not query the wrong window.
    """
    if limit <= 0 or offset < 0:
        raise ValueError("limit must be positive and offset non-negative")
    columns = ", ".join(f"{expr} AS {name}" for name, expr in POSTHOG_COLUMNS)
    events = ", ".join(f"'{event}'" for event in POSTHOG_EVENTS)
    return (
        f"SELECT {columns} FROM events "
        f"WHERE event IN ({events}) "
        f"AND timestamp >= toDateTime('{_iso(start)}') "
        f"AND timestamp < toDateTime('{_iso(end)}') "
        f"ORDER BY timestamp, uuid LIMIT {int(limit)} OFFSET {int(offset)}"
    )


def _text(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return value if isinstance(value, str) else json.dumps(value)


def _number(value: Any) -> float | None:
    try:
        return None if value is None or value == "" else float(value)
    except (TypeError, ValueError):
        return None


def _boolean(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value in ("true", "True", 1, "1"):
        return True
    if value in ("false", "False", 0, "0"):
        return False
    return None


NUMERIC_COLUMNS = {"quantity", "price", "cart_value"}
BOOLEAN_COLUMNS = {"has_subscription"}


def event_rows(columns: Sequence[str], results: Iterable[Sequence[Any]]) -> list[dict[str, Any]]:
    """PostHog's query response (`columns`, `results`) as typed rows."""
    rows = []
    for result in results:
        raw = dict(zip(columns, result))
        row: dict[str, Any] = {}
        for name, _ in POSTHOG_COLUMNS:
            value = raw.get(name)
            if name in NUMERIC_COLUMNS:
                row[name] = _number(value)
            elif name in BOOLEAN_COLUMNS:
                row[name] = _boolean(value)
            else:
                row[name] = _text(value)
        if row["uuid"] and row["event"] and row["distinct_id"] and row["timestamp"]:
            rows.append(row)
    return rows


# --- Shopify -----------------------------------------------------------------

#: The Admin API version the Double Helix app uses (apps/shopify-app/shopify.app.toml).
SHOPIFY_ADMIN_API_VERSION = "2026-10"

#: Orders by last update, so edits, refunds and cancellations are picked up.
#: No customer fields except the id, which is hashed before it's stored.
SHOPIFY_ORDERS_QUERY = """
query Orders($cursor: String, $search: String!) {
  orders(first: 100, after: $cursor, query: $search, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      createdAt
      processedAt
      updatedAt
      cancelledAt
      test
      sourceName
      currencyCode
      totalPriceSet { shopMoney { amount } }
      currentTotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      customAttributes { key value }
      customer { id }
      lineItems(first: 100) {
        nodes {
          id
          quantity
          sku
          product { id }
          variant { id }
          sellingPlan { name sellingPlanId }
          originalTotalSet { shopMoney { amount } }
        }
      }
    }
  }
}
"""

#: The cart attribute #108 sets: PostHog's anonymous id, which joins an order
#: to the experiment exposures of the visitor who placed it (ADR 0013).
POSTHOG_ID_ATTRIBUTE = "_posthog_id"


def orders_search(updated_since: str) -> str:
    """Shopify's search syntax for orders updated at or after a time."""
    return f"updated_at:>='{_iso(updated_since)}'"


def numeric_id(gid: str | None) -> str | None:
    """"gid://shopify/Order/123" -> "123", as packages/analytics does."""
    return gid.rsplit("/", 1)[-1] if gid else None


def hash_customer(gid: str | None, salt: bytes) -> str | None:
    """
    A stable pseudonym for a Shopify customer: HMAC-SHA256 with a secret salt.

    Repeat-purchase metrics need to know two orders share a customer, not who
    the customer is. Shopify's ids are sequential, so a plain hash could be
    reversed by hashing every id; the salt stops that.
    """
    if not gid:
        return None
    if len(salt) < 16:
        raise ValueError("The customer id salt must be at least 16 bytes.")
    return hmac.new(salt, gid.encode(), hashlib.sha256).hexdigest()


def _money(node: Mapping[str, Any] | None) -> float | None:
    return _number(((node or {}).get("shopMoney") or {}).get("amount"))


def order_row(node: Mapping[str, Any], salt: bytes) -> dict[str, Any]:
    """One order, with nothing that identifies the customer directly."""
    attributes = {a.get("key"): a.get("value") for a in node.get("customAttributes") or []}
    posthog_id = attributes.get(POSTHOG_ID_ATTRIBUTE)
    lines = (node.get("lineItems") or {}).get("nodes") or []
    return {
        "order_id": numeric_id(node.get("id")),
        "order_name": node.get("name"),
        "created_at": node.get("createdAt"),
        "processed_at": node.get("processedAt"),
        "updated_at": node.get("updatedAt"),
        "cancelled_at": node.get("cancelledAt"),
        "test": bool(node.get("test")),
        "source_name": node.get("sourceName"),
        "currency": node.get("currencyCode"),
        "total_amount": _money(node.get("totalPriceSet")),
        "current_total_amount": _money(node.get("currentTotalPriceSet")),
        "discount_amount": _money(node.get("totalDiscountsSet")),
        "posthog_id": posthog_id.lower() if isinstance(posthog_id, str) and posthog_id else None,
        "customer_hash": hash_customer((node.get("customer") or {}).get("id"), salt),
        "has_subscription": any(line.get("sellingPlan") for line in lines),
        "line_count": len(lines),
    }


def order_line_rows(node: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The order's lines: products, quantities and subscription plans."""
    order_id = numeric_id(node.get("id"))
    rows = []
    for line in (node.get("lineItems") or {}).get("nodes") or []:
        plan = line.get("sellingPlan") or {}
        rows.append(
            {
                "order_id": order_id,
                "line_id": numeric_id(line.get("id")),
                "product_id": numeric_id((line.get("product") or {}).get("id")),
                "variant_id": numeric_id((line.get("variant") or {}).get("id")),
                "sku": line.get("sku") or None,
                "quantity": int(line.get("quantity") or 0),
                "amount": _money(line.get("originalTotalSet")),
                "selling_plan": plan.get("name"),
                "selling_plan_id": numeric_id(plan.get("sellingPlanId")),
            }
        )
    return rows


def parse_time(value: str) -> datetime:
    """An ISO timestamp, with a trailing Z accepted."""
    return datetime.fromisoformat(_iso(value).replace("Z", "+00:00"))

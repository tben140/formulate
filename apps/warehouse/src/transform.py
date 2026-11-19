"""
Pure functions the loader notebooks share: query building and row shaping.

No Spark and no network here, so they run under plain `python -m unittest`
(apps/warehouse/tests). The notebooks do the fetching and the writing.

⚠️ What may reach the warehouse is decided here. The workspace is in the US
(AWS us-east-2), so nothing that identifies a person directly is loaded: no
names, emails, phone numbers, addresses or IP addresses. Visitor ids are
PostHog's anonymous ids; Shopify customer ids are hashed with a secret salt.
PostHog's export lands whole events in a landing table; only the columns
below are copied out, and the landing rows are deleted the same run.
See apps/warehouse/AGENTS.md.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime
from typing import Any, Mapping

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

#: Column name, event property, SQL type. PostHog's Databricks export lands
#: whole events, every property included; only these are copied out of it.
#: `$ip`, the person properties and everything else stay behind and are
#: deleted with the landing rows.
POSTHOG_PROPERTIES: tuple[tuple[str, str, str], ...] = (
    ("surface", "surface", "string"),
    ("session_id", "$session_id", "string"),
    ("pathname", "$pathname", "string"),
    ("screen_name", "$screen_name", "string"),
    ("experiment_key", "experiment_key", "string"),
    ("variation_id", "variation_id", "string"),
    ("product_id", "product_id", "string"),
    ("variant_id", "variant_id", "string"),
    ("quantity", "quantity", "double"),
    ("price", "price", "double"),
    ("cart_value", "cart_value", "double"),
    ("currency", "currency", "string"),
    ("selling_plan", "selling_plan", "string"),
    ("has_subscription", "has_subscription", "boolean"),
)

_PROPERTY_NAME = re.compile(r"^\$?[a-z_]+$")
_TABLE_NAME = re.compile(r"^`[A-Za-z0-9_]+`\.`[A-Za-z0-9_]+`\.`?[A-Za-z0-9_]+`?$")


def _property(name: str, sql_type: str) -> str:
    """One property out of the export's VARIANT `properties` column."""
    if not _PROPERTY_NAME.match(name) or sql_type not in ("string", "double", "boolean"):
        raise ValueError(f"Unexpected property: {name!r} {sql_type!r}")
    # try_variant_get: a value of the wrong type becomes NULL, not a failed load.
    return f"try_variant_get(properties, '$[\"{name}\"]', '{sql_type}')"


def landing_projection_sql(landing_table: str) -> str:
    """
    The rows to copy out of PostHog's landing table, one per event uuid.

    Takes the rows the export had landed by `:cutoff` (a bound parameter), so
    a run never deletes rows it didn't copy. The export appends with COPY
    INTO and can land an event twice on a retry; the newest copy wins.
    """
    if not _TABLE_NAME.match(landing_table):
        raise ValueError(f"Not a qualified table name: {landing_table!r}")
    properties = ",\n  ".join(
        f"{_property(prop, sql_type)} AS {name}" for name, prop, sql_type in POSTHOG_PROPERTIES
    )
    events = ", ".join(f"'{event}'" for event in POSTHOG_EVENTS)
    return (
        "SELECT\n"
        "  uuid,\n  event,\n  distinct_id,\n  timestamp,\n"
        f"  {properties}\n"
        f"FROM {landing_table}\n"
        "WHERE databricks_ingested_timestamp <= :cutoff\n"
        f"  AND event IN ({events})\n"
        "  AND uuid IS NOT NULL AND distinct_id IS NOT NULL AND timestamp IS NOT NULL\n"
        "QUALIFY row_number() OVER (PARTITION BY uuid ORDER BY databricks_ingested_timestamp DESC) = 1"
    )


_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")


def _iso(value: str) -> str:
    """A timestamp safe to put inside a query string."""
    if not _ISO.match(value):
        raise ValueError(f"Not an ISO timestamp: {value!r}")
    return value


def _number(value: Any) -> float | None:
    try:
        return None if value is None or value == "" else float(value)
    except (TypeError, ValueError):
        return None


# --- Shopify -----------------------------------------------------------------

#: The Admin API version the Double Helix app uses (apps/shopify-app/shopify.app.toml).
SHOPIFY_ADMIN_API_VERSION = "2026-10"

#: How far back a `read_orders` token can see: Shopify limits it to orders
#: created in the last 60 days. Older orders need `read_all_orders`, which is
#: a separate permission request, not a setting here.
MAX_ORDER_BACKFILL_DAYS = 60

#: Page sizes. Shopify prices a query before running it, multiplying nested
#: connections by their page sizes, and refuses one over 1,000 points. Ten
#: orders of ten lines stays well under; an order with more lines has the
#: rest fetched with SHOPIFY_ORDER_LINES_QUERY. To see a query's price, send
#: it with the header `Shopify-GraphQL-Cost-Debug: 1`.
ORDERS_PAGE_SIZE = 10
LINES_PAGE_SIZE = 10

_LINE_FIELDS = """
          id
          quantity
          sku
          product { id }
          variant { id }
          sellingPlan { name sellingPlanId }
          originalTotalSet { shopMoney { amount } }"""

#: Orders by last update, so edits, refunds and cancellations are picked up.
#: No customer fields except the id, which is hashed before it's stored.
SHOPIFY_ORDERS_QUERY = f"""
query Orders($cursor: String, $search: String!) {{
  orders(first: {ORDERS_PAGE_SIZE}, after: $cursor, query: $search, sortKey: UPDATED_AT) {{
    pageInfo {{ hasNextPage endCursor }}
    nodes {{
      id
      name
      createdAt
      processedAt
      updatedAt
      cancelledAt
      test
      sourceName
      currencyCode
      totalPriceSet {{ shopMoney {{ amount }} }}
      currentTotalPriceSet {{ shopMoney {{ amount }} }}
      totalDiscountsSet {{ shopMoney {{ amount }} }}
      customAttributes {{ key value }}
      customer {{ id }}
      lineItems(first: {LINES_PAGE_SIZE}) {{
        pageInfo {{ hasNextPage endCursor }}
        nodes {{{_LINE_FIELDS}
        }}
      }}
    }}
  }}
}}
"""

#: The rest of one order's lines, fifty at a time, after the first page.
SHOPIFY_ORDER_LINES_QUERY = f"""
query OrderLines($id: ID!, $cursor: String) {{
  order(id: $id) {{
    lineItems(first: 50, after: $cursor) {{
      pageInfo {{ hasNextPage endCursor }}
      nodes {{{_LINE_FIELDS}
      }}
    }}
  }}
}}
"""


def next_cursor(previous: str | None, cursor: str | None) -> str | None:
    """
    The cursor for the next page, refusing one that didn't move: a page that
    says there's more but hands back the same cursor would loop for ever.
    """
    if cursor is not None and cursor == previous:
        raise RuntimeError("Shopify returned the same page cursor twice; stopping.")
    return cursor


def more_lines_cursor(node: Mapping[str, Any]) -> str | None:
    """The cursor to fetch an order's remaining lines from, or None if it has them all."""
    page = ((node.get("lineItems") or {}).get("pageInfo")) or {}
    return page.get("endCursor") if page.get("hasNextPage") else None

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

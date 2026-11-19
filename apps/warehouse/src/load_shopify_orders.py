# Databricks notebook source
# MAGIC %md
# MAGIC # Load Shopify orders
# MAGIC
# MAGIC Pulls orders updated since the last run from the Admin API and merges
# MAGIC them into `orders` and `order_lines`. Ordered by update time, so edits,
# MAGIC refunds and cancellations are picked up as well as new orders.
# MAGIC
# MAGIC The token belongs to a custom app with only `read_orders`. Nothing that
# MAGIC identifies a customer directly is loaded (`transform.order_row`).

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "double_helix")
dbutils.widgets.text("shop_domain", "")
dbutils.widgets.text("backfill_days", "60")
dbutils.widgets.text("src_dir", "")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
shop_domain = dbutils.widgets.get("shop_domain").strip()
backfill_days = int(dbutils.widgets.get("backfill_days"))
target = f"`{catalog}`.`{schema}`"
if not shop_domain.endswith(".myshopify.com"):
    raise ValueError("Set shop_domain to the store's *.myshopify.com domain.")

# COMMAND ----------

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# transform.py sits beside this notebook. Serverless compute doesn't promise
# the notebook's folder is on the path, so the job passes it (databricks.yml);
# a run by hand falls back to the notebook's own folder.
src_dir = dbutils.widgets.get("src_dir").strip() or "/Workspace" + os.path.dirname(
    dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

import transform

if not 0 < backfill_days <= transform.MAX_ORDER_BACKFILL_DAYS:
    raise ValueError(
        f"backfill_days must be 1 to {transform.MAX_ORDER_BACKFILL_DAYS}: a read_orders "
        "token sees only the last 60 days of orders. Older ones need read_all_orders."
    )

token = dbutils.secrets.get("double-helix", "shopify_admin_token")
salt = dbutils.secrets.get("double-helix", "customer_id_salt").encode()
endpoint = f"https://{shop_domain}/admin/api/{transform.SHOPIFY_ADMIN_API_VERSION}/graphql.json"


def graphql(query: str, variables: dict) -> dict:
    """One query's data. Waits out throttling; never puts the token in an error."""
    body = json.dumps({"query": query, "variables": variables}).encode()
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"Shopify request failed: HTTP {error.code}") from None
        errors = payload.get("errors") or []
        if any((e.get("extensions") or {}).get("code") == "THROTTLED" for e in errors):
            time.sleep(5 * (attempt + 1))
            continue
        if errors:
            raise RuntimeError(f"Shopify GraphQL errors: {[e.get('message') for e in errors]}")
        return payload["data"]
    raise RuntimeError("Shopify request failed: throttled")


def with_all_lines(node: dict) -> dict:
    """The order with every line, fetching the pages after the first."""
    cursor = transform.more_lines_cursor(node)
    while cursor:
        page = graphql(transform.SHOPIFY_ORDER_LINES_QUERY, {"id": node["id"], "cursor": cursor})
        line_items = (page.get("order") or {}).get("lineItems") or {}
        node["lineItems"]["nodes"].extend(line_items.get("nodes") or [])
        node["lineItems"]["pageInfo"] = line_items.get("pageInfo") or {}
        cursor = transform.more_lines_cursor(node)
    return node


# COMMAND ----------

now = datetime.now(timezone.utc).replace(microsecond=0)
newest = spark.sql(f"SELECT max(updated_at) AS t FROM {target}.orders").first().t
since = (
    newest.replace(tzinfo=timezone.utc) - timedelta(hours=1)
    if newest
    else now - timedelta(days=backfill_days)
)

orders, lines = [], []
cursor = None
while True:
    page = graphql(
        transform.SHOPIFY_ORDERS_QUERY,
        {"cursor": cursor, "search": transform.orders_search(since.isoformat().replace("+00:00", "Z"))},
    )["orders"]
    for node in page["nodes"]:
        node = with_all_lines(node)
        orders.append(transform.order_row(node, salt))
        lines.extend(transform.order_line_rows(node))
    if not page["pageInfo"]["hasNextPage"]:
        break
    cursor = page["pageInfo"]["endCursor"]

# COMMAND ----------

ORDER_DDL = (
    "order_id STRING, order_name STRING, created_at STRING, processed_at STRING, "
    "updated_at STRING, cancelled_at STRING, test BOOLEAN, source_name STRING, "
    "currency STRING, total_amount DOUBLE, current_total_amount DOUBLE, "
    "discount_amount DOUBLE, posthog_id STRING, customer_hash STRING, "
    "has_subscription BOOLEAN, line_count INT"
)
LINE_DDL = (
    "order_id STRING, line_id STRING, product_id STRING, variant_id STRING, sku STRING, "
    "quantity INT, amount DOUBLE, selling_plan STRING, selling_plan_id STRING"
)

# The lines are written before the orders. The next run starts from the
# newest order's updated_at, so the orders' merge is what moves the
# checkpoint: if a line write fails first, the checkpoint hasn't moved and the
# next run fetches the same orders again. An order's lines are replaced whole,
# since an edited order can lose a line, which a merge on line id would miss.
if orders:
    spark.createDataFrame(orders, ORDER_DDL).createOrReplaceTempView("incoming_orders")
    spark.sql(f"""
      DELETE FROM {target}.order_lines
      WHERE order_id IN (SELECT order_id FROM incoming_orders)
    """)
    if lines:
        spark.createDataFrame(lines, LINE_DDL).createOrReplaceTempView("incoming_lines")
        spark.sql(f"""
          INSERT INTO {target}.order_lines
          SELECT *, current_timestamp() AS loaded_at FROM incoming_lines
        """)
    spark.sql(f"""
      MERGE INTO {target}.orders AS t
      USING (
        SELECT * EXCEPT (created_at, processed_at, updated_at, cancelled_at),
               to_timestamp(created_at) AS created_at,
               to_timestamp(processed_at) AS processed_at,
               to_timestamp(updated_at) AS updated_at,
               to_timestamp(cancelled_at) AS cancelled_at,
               current_timestamp() AS loaded_at
        FROM incoming_orders
      ) AS s
      ON t.order_id = s.order_id
      WHEN MATCHED THEN UPDATE SET *
      WHEN NOT MATCHED THEN INSERT *
    """)

print(f"Loaded {len(orders)} orders and {len(lines)} lines updated since {since.isoformat()}")

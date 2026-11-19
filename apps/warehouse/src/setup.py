# Databricks notebook source
# MAGIC %md
# MAGIC # Warehouse setup
# MAGIC
# MAGIC Creates the schema, the tables the loaders write, and the views GrowthBook
# MAGIC reads (ADR 0013). Safe to run any number of times: everything is
# MAGIC `IF NOT EXISTS` or `CREATE OR REPLACE VIEW`.
# MAGIC
# MAGIC Also makes sure the secret scope exists and holds a salt for hashing
# MAGIC Shopify customer ids. The salt is generated here and never shown to
# MAGIC anyone. The Shopify token is put in by hand, with the Databricks CLI
# MAGIC (apps/warehouse/AGENTS.md). PostHog needs no key here: its export
# MAGIC signs in to Databricks with its own service principal.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "double_helix")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
target = f"`{catalog}`.`{schema}`"

SCOPE = "double-helix"

# COMMAND ----------

import secrets as random_source

from databricks.sdk import WorkspaceClient

workspace = WorkspaceClient()
if SCOPE not in {scope.name for scope in workspace.secrets.list_scopes()}:
    workspace.secrets.create_scope(SCOPE)
keys = {secret.key for secret in workspace.secrets.list_secrets(SCOPE)}
if "customer_id_salt" not in keys:
    # Generated once. Changing it later would give every customer a new hash,
    # and repeat-purchase metrics would see them all as new. So a missing salt
    # with hashes already loaded is an error, never a reason to make a new one.
    if spark.catalog.tableExists(f"{catalog}.{schema}.orders") and spark.sql(
        f"SELECT 1 FROM {target}.orders WHERE customer_hash IS NOT NULL LIMIT 1"
    ).first():
        raise RuntimeError(
            "customer_id_salt is missing but orders already carry customer hashes. "
            "Restore the original salt; a new one would break every repeat-purchase join."
        )
    # The job runs one at a time (databricks.yml), but a run by hand could
    # overlap it. Reading the salt back catches a second setup that wrote its
    # own in between: stop rather than load with a salt that's been replaced.
    salt = random_source.token_hex(32)
    workspace.secrets.put_secret(SCOPE, "customer_id_salt", string_value=salt)
    if dbutils.secrets.get(SCOPE, "customer_id_salt") != salt:
        raise RuntimeError("Another setup run wrote customer_id_salt at the same time. Run setup again.")
missing = {"shopify_admin_token"} - keys
print("Secrets still to add with the CLI:", ", ".join(sorted(missing)) or "none")

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {target}")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {target}.posthog_events (
  uuid STRING NOT NULL,
  event STRING NOT NULL,
  distinct_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  surface STRING,
  session_id STRING,
  pathname STRING,
  screen_name STRING,
  experiment_key STRING,
  variation_id STRING,
  product_id STRING,
  variant_id STRING,
  quantity DOUBLE,
  price DOUBLE,
  cart_value DOUBLE,
  currency STRING,
  selling_plan STRING,
  has_subscription BOOLEAN,
  loaded_at TIMESTAMP NOT NULL
) COMMENT 'PostHog events in the shared vocabulary, copied from the export''s landing table. Anonymous ids only; no IP or person properties.'
""")

# PostHog's batch export appends to this table. It's created here, in the
# shape PostHog's Databricks destination writes, so the job owns it and can
# read and delete its rows; PostHog's service principal only gets SELECT and
# MODIFY on it (docs/integration-growthbook.md). Whole events land here, so
# nothing but the loader reads it, and GrowthBook has no grant on it.
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {target}.posthog_events_landing (
  uuid STRING,
  event STRING,
  properties VARIANT,
  person_properties VARIANT,
  person_id STRING,
  distinct_id STRING,
  team_id BIGINT,
  timestamp TIMESTAMP,
  created_at TIMESTAMP,
  databricks_ingested_timestamp TIMESTAMP
) COMMENT 'Staging for PostHog''s batch export. Rows are copied to posthog_events and deleted each morning.'
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {target}.orders (
  order_id STRING NOT NULL,
  order_name STRING,
  created_at TIMESTAMP,
  processed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  cancelled_at TIMESTAMP,
  test BOOLEAN,
  source_name STRING,
  currency STRING,
  total_amount DOUBLE,
  current_total_amount DOUBLE,
  discount_amount DOUBLE,
  posthog_id STRING,
  customer_hash STRING,
  has_subscription BOOLEAN,
  line_count INT,
  loaded_at TIMESTAMP NOT NULL
) COMMENT 'Shopify orders. No names, emails or addresses; customer ids are salted hashes.'
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {target}.order_lines (
  order_id STRING NOT NULL,
  line_id STRING NOT NULL,
  product_id STRING,
  variant_id STRING,
  sku STRING,
  quantity INT,
  amount DOUBLE,
  selling_plan STRING,
  selling_plan_id STRING,
  loaded_at TIMESTAMP NOT NULL
) COMMENT 'Shopify order lines: products, quantities and subscription plans.'
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Views GrowthBook reads
# MAGIC
# MAGIC GrowthBook's Databricks data source points its exposure query at
# MAGIC `experiment_exposures` and its metrics at `attributed_orders`. Both use
# MAGIC PostHog's anonymous id as `user_id`, which is what joins an order to the
# MAGIC experiment its visitor saw. Test orders are kept, flagged: on the demo
# MAGIC store every order is a test order.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {target}.experiment_exposures AS
SELECT
  distinct_id AS user_id,
  timestamp,
  experiment_key AS experiment_id,
  variation_id,
  surface
FROM {target}.posthog_events
WHERE event = 'experiment_viewed'
  AND experiment_key IS NOT NULL
  AND variation_id IS NOT NULL
""")

spark.sql(f"""
CREATE OR REPLACE VIEW {target}.attributed_orders AS
SELECT
  posthog_id AS user_id,
  coalesce(processed_at, created_at) AS timestamp,
  order_id,
  current_total_amount AS revenue,
  currency,
  has_subscription,
  test
FROM {target}.orders
WHERE posthog_id IS NOT NULL
  AND cancelled_at IS NULL
""")

print(f"Ready: {target}")

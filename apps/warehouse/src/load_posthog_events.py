# Databricks notebook source
# MAGIC %md
# MAGIC # Load PostHog events
# MAGIC
# MAGIC PostHog's Databricks batch export lands whole events in a landing table
# MAGIC (docs/integration-growthbook.md, "Connecting PostHog"). This copies the
# MAGIC shared event vocabulary out of it, only the columns in
# MAGIC `transform.POSTHOG_PROPERTIES`, and merges them into `posthog_events` by
# MAGIC event uuid, so a rerun or a duplicate from the export never adds a row.
# MAGIC
# MAGIC Then it deletes the landing rows it read, so the whole events (every
# MAGIC property, person properties too) leave the table the day they land.
# MAGIC Delta keeps deleted rows in old files for 7 days, for time travel, and
# MAGIC VACUUM removes them after that.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "double_helix")
dbutils.widgets.text("landing_table", "posthog_events_landing")
dbutils.widgets.text("src_dir", "")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
landing_name = dbutils.widgets.get("landing_table").strip()
target = f"`{catalog}`.`{schema}`"
landing = f"{target}.`{landing_name}`"

# COMMAND ----------

import os
import sys

# transform.py sits beside this notebook. Serverless compute doesn't promise
# the notebook's folder is on the path, so the job passes it (databricks.yml);
# a run by hand falls back to the notebook's own folder.
src_dir = dbutils.widgets.get("src_dir").strip() or "/Workspace" + os.path.dirname(
    dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

import transform

# COMMAND ----------

if not spark.catalog.tableExists(f"{catalog}.{schema}.{landing_name}"):
    dbutils.notebook.exit(f"No {landing_name} yet: PostHog's export hasn't run. Nothing to load.")

# Everything the export had landed when this run started. Rows it lands while
# this runs are newer than the cutoff, so they're neither copied nor deleted:
# the next run takes them.
cutoff = spark.sql(f"SELECT max(databricks_ingested_timestamp) AS t FROM {landing}").first().t
if cutoff is None:
    dbutils.notebook.exit("The landing table is empty. Nothing to load.")

projection = transform.landing_projection_sql(landing)
copied = spark.sql(f"SELECT count(*) AS n FROM ({projection})", args={"cutoff": cutoff}).first().n

spark.sql(
    f"""
    MERGE INTO {target}.posthog_events AS t
    USING (SELECT *, current_timestamp() AS loaded_at FROM ({projection})) AS s
    ON t.uuid = s.uuid
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
    """,
    args={"cutoff": cutoff},
)

# Only after the merge succeeded: a failed merge leaves the rows for the next
# run. Deleted rows stay in Delta's old files until VACUUM removes them, which
# by default keeps them 7 days for time travel.
spark.sql(
    f"DELETE FROM {landing} WHERE databricks_ingested_timestamp <= :cutoff",
    args={"cutoff": cutoff},
)
spark.sql(f"VACUUM {landing}")

print(f"Copied {copied} events landed up to {cutoff.isoformat()}; landing rows deleted.")

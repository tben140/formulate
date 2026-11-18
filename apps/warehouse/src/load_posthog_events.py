# Databricks notebook source
# MAGIC %md
# MAGIC # Load PostHog events
# MAGIC
# MAGIC Pulls the shared event vocabulary from PostHog's query API, a day at a
# MAGIC time, and merges it into `posthog_events` by event uuid, so a rerun or an
# MAGIC overlapping window never duplicates a row. Each run starts a day before
# MAGIC the newest event already loaded, to catch late arrivals.
# MAGIC
# MAGIC Only the columns in `transform.POSTHOG_COLUMNS` are requested: no IP, no
# MAGIC person properties.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "double_helix")
dbutils.widgets.text("posthog_project_id", "")
dbutils.widgets.text("backfill_days", "90")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
project_id = dbutils.widgets.get("posthog_project_id").strip()
backfill_days = int(dbutils.widgets.get("backfill_days"))
target = f"`{catalog}`.`{schema}`"
if not project_id.isdigit():
    raise ValueError("Set posthog_project_id: the number in PostHog's project URL.")

# COMMAND ----------

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import transform

POSTHOG_API = "https://eu.posthog.com"
PAGE_SIZE = 10_000
api_key = dbutils.secrets.get("double-helix", "posthog_personal_api_key")


def query(hogql: str) -> dict:
    """One HogQL query. Retries rate limits; never puts the key in an error."""
    request = urllib.request.Request(
        f"{POSTHOG_API}/api/projects/{project_id}/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 4:
                time.sleep(15 * (attempt + 1))
                continue
            raise RuntimeError(f"PostHog query failed: HTTP {error.code}") from None
    raise RuntimeError("PostHog query failed: rate limited")


# COMMAND ----------

now = datetime.now(timezone.utc).replace(microsecond=0)
newest = spark.sql(f"SELECT max(timestamp) AS t FROM {target}.posthog_events").first().t
start = (
    newest.replace(tzinfo=timezone.utc) - timedelta(days=1)
    if newest
    else now - timedelta(days=backfill_days)
).replace(hour=0, minute=0, second=0, microsecond=0)

columns_ddl = ", ".join(
    f"{name} {'DOUBLE' if name in transform.NUMERIC_COLUMNS else 'BOOLEAN' if name in transform.BOOLEAN_COLUMNS else 'STRING'}"
    for name, _ in transform.POSTHOG_COLUMNS
)
loaded = 0
day = start
while day < now:
    end = min(day + timedelta(days=1), now)
    offset = 0
    while True:
        response = query(
            transform.hogql_events_query(
                day.isoformat().replace("+00:00", "Z"),
                end.isoformat().replace("+00:00", "Z"),
                PAGE_SIZE,
                offset,
            )
        )
        rows = transform.event_rows(response.get("columns", []), response.get("results", []))
        if rows:
            spark.createDataFrame(rows, columns_ddl).createOrReplaceTempView("incoming_events")
            spark.sql(f"""
              MERGE INTO {target}.posthog_events AS t
              USING (
                SELECT * EXCEPT (timestamp), to_timestamp(timestamp) AS timestamp,
                       current_timestamp() AS loaded_at
                FROM incoming_events
              ) AS s
              ON t.uuid = s.uuid
              WHEN MATCHED THEN UPDATE SET *
              WHEN NOT MATCHED THEN INSERT *
            """)
            loaded += len(rows)
        if len(response.get("results", [])) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    day = end

print(f"Loaded {loaded} events from {start.date()} to {now.isoformat()}")

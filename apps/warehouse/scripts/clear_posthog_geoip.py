"""
Clear GeoIP location from PostHog's person profiles, once, before the
Databricks export starts (docs/integration-growthbook.md, "Connecting
PostHog").

PostHog's GeoIP transformation was on until the export was set up, so persons
seen before then carry `$geoip_*` and `$initial_geoip_*` properties (city,
region, postcode, coordinates). The export copies person properties with
every event, so without this a returning visitor's old city would reach the
landing table. Turning GeoIP off stops new ones; this removes the old ones.

Dry run by default: it lists how many persons and which property names it
would clear. `--apply` sends one `$set` event per person with `$unset` naming
those properties, through PostHog's public capture endpoint. PostHog applies
them a little later, so wait a few minutes and run the dry run again: it
reads the current profiles, and should find none.

Environment (put in your own shell, never in the repository):
  POSTHOG_PERSONAL_API_KEY  a personal API key with Query: Read, this project
  POSTHOG_PROJECT_ID        the number in the project's URL
  POSTHOG_PROJECT_KEY       the project's public key (phc_…), for capture

Run from the repository root:
  python3 -I apps/warehouse/scripts/clear_posthog_geoip.py [--apply]
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Iterable

HOST = "https://eu.posthog.com"
CAPTURE = "https://eu.i.posthog.com/batch/"
PAGE = 500
GEO_PREFIXES = ("$geoip_", "$initial_geoip_")


def geo_keys(properties: dict[str, Any]) -> list[str]:
    """The person properties that hold location."""
    return sorted(key for key in properties if key.startswith(GEO_PREFIXES))


def persons_query(after: str | None, limit: int) -> str:
    """
    One page of persons whose current profile carries any GeoIP property,
    with one of their distinct ids. It reads the persons table, not events,
    so it finds profiles whose events have expired too, and every GeoIP key
    (a profile can hold coordinates without a country code). The match on
    the raw properties is loose; `geo_keys` decides what is cleared.

    Keyset paging on the person id (`> after`), since PostHog's query API
    refuses OFFSET from a personal key. The id is a UUID PostHog made,
    checked before it goes into the query; nothing else is interpolated.
    """
    if after is not None and not _is_uuid(after):
        raise ValueError(f"Not a person id: {after!r}")
    where = f"AND toString(p.id) > '{after}' " if after else ""
    return (
        "SELECT toString(p.id) AS pid, any(pdi.distinct_id), any(p.properties) "  # noqa: S608
        "FROM persons AS p "
        "INNER JOIN person_distinct_ids AS pdi ON pdi.person_id = p.id "
        "WHERE (toString(p.properties) LIKE '%\"$geoip_%' "
        "OR toString(p.properties) LIKE '%\"$initial_geoip_%') "
        f"{where}"
        f"GROUP BY pid ORDER BY pid LIMIT {int(limit)}"
    )


def _is_uuid(value: str) -> bool:
    parts = value.split("-")
    return [len(p) for p in parts] == [8, 4, 4, 4, 12] and all(
        c in "0123456789abcdef" for c in value.replace("-", "")
    )


def unset_events(rows: Iterable[tuple[str, dict[str, Any], str]]) -> list[dict[str, Any]]:
    """One `$set` event per person, unsetting its location properties."""
    events = []
    for _, properties, distinct_id in rows:
        keys = geo_keys(properties)
        if keys and distinct_id:
            events.append(
                {"event": "$set", "distinct_id": distinct_id, "properties": {"$unset": keys}}
            )
    return events


def _post(url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 4:
                time.sleep(15 * (attempt + 1))
                continue
            # Never echo the request: it carries a key.
            raise SystemExit(f"PostHog request failed: HTTP {error.code}") from None
    raise SystemExit("PostHog request failed: rate limited")


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    try:
        key = os.environ["POSTHOG_PERSONAL_API_KEY"]
        project = os.environ["POSTHOG_PROJECT_ID"]
        project_key = os.environ["POSTHOG_PROJECT_KEY"] if apply else ""
    except KeyError as missing:
        raise SystemExit(f"Set {missing.args[0]} in your shell first.") from None
    if not project.isdigit():
        raise SystemExit("POSTHOG_PROJECT_ID is the number in the project's URL.")

    after, persons, names = None, 0, set()
    while True:
        result = _post(
            f"{HOST}/api/projects/{project}/query/",
            {"query": {"kind": "HogQLQuery", "query": persons_query(after, PAGE)}},
            {"Authorization": f"Bearer {key}"},
        )
        rows = [
            (pid, props if isinstance(props, dict) else json.loads(props or "{}"), did)
            for pid, did, props in result.get("results", [])
        ]
        if not rows:
            break
        events = unset_events(rows)
        persons += len(events)
        for event in events:
            names.update(event["properties"]["$unset"])
        if apply and events:
            reply = _post(CAPTURE, {"api_key": project_key, "batch": events}, {})
            # Over its quota, PostHog answers 200 and drops the events.
            if reply.get("quota_limited"):
                raise SystemExit(
                    f"PostHog's capture quota is used up; {persons - len(events)} persons "
                    "were queued before this batch. Run again once it resets."
                )
        after = rows[-1][0]
        if len(rows) < PAGE:
            break

    if apply:
        print(f"Queued location removal for {persons} persons; PostHog applies it shortly.")
    else:
        print(f"Would clear location from {persons} persons.")
    print("Properties:", ", ".join(sorted(names)) or "none")
    if not apply and persons:
        print("Run again with --apply to clear them.")
    if apply and persons:
        print("In a few minutes, run the dry run again: it should find none.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""Run from the repository root: python3 -I -m unittest discover -s apps/warehouse/tests"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import clear_posthog_geoip as clear  # noqa: E402


class ClearGeoip(unittest.TestCase):
    def test_finds_only_location_keys(self):
        props = {
            "$initial_geoip_city_name": "Leeds",
            "$geoip_latitude": 53.8,
            "$initial_referrer": "$direct",
            "surface": "web",
        }
        self.assertEqual(
            clear.geo_keys(props), ["$geoip_latitude", "$initial_geoip_city_name"]
        )

    def test_one_unset_event_per_person_with_location(self):
        rows = [
            ("p1", {"$initial_geoip_city_name": "Leeds"}, "d1"),
            ("p2", {"$initial_referrer": "$direct"}, "d2"),
            ("p3", {"$geoip_country_code": "GB"}, ""),
        ]
        events = clear.unset_events(rows)
        self.assertEqual(
            events,
            [{"event": "$set", "distinct_id": "d1", "properties": {"$unset": ["$initial_geoip_city_name"]}}],
        )

    def test_pages_by_person_id_without_offset(self):
        first = clear.persons_query(None, 500)
        later = clear.persons_query("01934f6e-2c4b-7a1d-9e3f-0123456789ab", 500)
        self.assertNotIn("OFFSET", first + later)
        self.assertIn("> '01934f6e-2c4b-7a1d-9e3f-0123456789ab'", later)
        self.assertTrue(first.endswith("LIMIT 500"))

    def test_refuses_an_odd_cursor(self):
        with self.assertRaises(ValueError):
            clear.persons_query("x' OR 1=1 --", 500)


if __name__ == "__main__":
    unittest.main()

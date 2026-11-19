"""Run from the repository root: python3 -I -m unittest discover -s apps/warehouse/tests"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import transform  # noqa: E402

SALT = b"0123456789abcdef0123456789abcdef"


LANDING = "`workspace`.`double_helix`.`posthog_events_landing`"


class LandingProjection(unittest.TestCase):
    def setUp(self):
        self.sql = transform.landing_projection_sql(LANDING)

    def test_copies_only_the_listed_properties(self):
        for name, prop, _ in transform.POSTHOG_PROPERTIES:
            self.assertIn(f"""'$["{prop}"]'""", self.sql)
            self.assertIn(f" AS {name}", self.sql)
        self.assertEqual(self.sql.count("try_variant_get("), len(transform.POSTHOG_PROPERTIES))

    def test_never_copies_the_ip_or_the_person(self):
        self.assertNotIn("$ip", self.sql)
        self.assertNotIn("person", self.sql)
        self.assertNotIn("SELECT *", self.sql)

    def test_only_the_shared_vocabulary(self):
        self.assertIn("'experiment_viewed'", self.sql)
        self.assertIn("AND event IN (", self.sql)

    def test_one_row_per_uuid_up_to_the_cutoff(self):
        self.assertIn("databricks_ingested_timestamp <= :cutoff", self.sql)
        self.assertIn("PARTITION BY uuid", self.sql)

    def test_refuses_an_unqualified_or_odd_table_name(self):
        for bad in ["posthog_events_landing", "`a`.`b`.`c`; DROP TABLE x", ""]:
            with self.assertRaises(ValueError):
                transform.landing_projection_sql(bad)

    def test_matches_the_table_columns(self):
        # setup.py's posthog_events, less the four ids and loaded_at.
        names = [name for name, _, _ in transform.POSTHOG_PROPERTIES]
        self.assertEqual(len(names), len(set(names)))
        setup = open(os.path.join(os.path.dirname(__file__), "..", "src", "setup.py")).read()
        table = setup.split("posthog_events (")[1].split(") COMMENT")[0]
        for name in names:
            self.assertRegex(table, rf"\b{name} (STRING|DOUBLE|BOOLEAN)")


ORDER = {
    "id": "gid://shopify/Order/1001",
    "name": "#1001",
    "createdAt": "2026-11-01T10:00:00Z",
    "processedAt": "2026-11-01T10:00:01Z",
    "updatedAt": "2026-11-01T10:05:00Z",
    "cancelledAt": None,
    "test": True,
    "sourceName": "web",
    "currencyCode": "GBP",
    "totalPriceSet": {"shopMoney": {"amount": "39.98"}},
    "currentTotalPriceSet": {"shopMoney": {"amount": "39.98"}},
    "totalDiscountsSet": {"shopMoney": {"amount": "4.00"}},
    "customAttributes": [
        {"key": "_posthog_id", "value": "0F8FAD5B-D9CB-469F-A165-70867728950E"}
    ],
    "customer": {"id": "gid://shopify/Customer/77"},
    "email": "someone@example.com",
    "lineItems": {
        "nodes": [
            {
                "id": "gid://shopify/LineItem/1",
                "quantity": 2,
                "sku": "MAG-60",
                "product": {"id": "gid://shopify/Product/5"},
                "variant": {"id": "gid://shopify/ProductVariant/9"},
                "sellingPlan": {
                    "name": "Delivered every 30 days",
                    "sellingPlanId": "gid://shopify/SellingPlan/3",
                },
                "originalTotalSet": {"shopMoney": {"amount": "43.98"}},
            }
        ]
    },
}


class Orders(unittest.TestCase):
    def test_order_row(self):
        row = transform.order_row(ORDER, SALT)
        self.assertEqual(row["order_id"], "1001")
        self.assertEqual(row["total_amount"], 39.98)
        self.assertEqual(row["posthog_id"], "0f8fad5b-d9cb-469f-a165-70867728950e")
        self.assertTrue(row["has_subscription"])
        self.assertTrue(row["test"])

    def test_nothing_identifies_the_customer(self):
        row = transform.order_row(ORDER, SALT)
        values = " ".join(str(v) for v in row.values())
        self.assertNotIn("someone@example.com", values)
        self.assertNotIn("Customer/77", values)
        self.assertEqual(len(row["customer_hash"]), 64)

    def test_customer_hash_is_stable_and_salted(self):
        a = transform.hash_customer("gid://shopify/Customer/77", SALT)
        self.assertEqual(a, transform.hash_customer("gid://shopify/Customer/77", SALT))
        self.assertNotEqual(a, transform.hash_customer("gid://shopify/Customer/77", SALT[::-1]))
        with self.assertRaises(ValueError):
            transform.hash_customer("gid://shopify/Customer/77", b"short")

    def test_order_without_attribution_or_customer(self):
        bare = dict(ORDER, customAttributes=[], customer=None, lineItems={"nodes": []})
        row = transform.order_row(bare, SALT)
        self.assertIsNone(row["posthog_id"])
        self.assertIsNone(row["customer_hash"])
        self.assertFalse(row["has_subscription"])

    def test_order_lines(self):
        (line,) = transform.order_line_rows(ORDER)
        self.assertEqual(line["order_id"], "1001")
        self.assertEqual(line["product_id"], "5")
        self.assertEqual(line["quantity"], 2)
        self.assertEqual(line["selling_plan_id"], "3")

    def test_orders_search(self):
        self.assertEqual(
            transform.orders_search("2026-11-01T00:00:00Z"),
            "updated_at:>='2026-11-01T00:00:00Z'",
        )
        with self.assertRaises(ValueError):
            transform.orders_search("yesterday")


if __name__ == "__main__":
    unittest.main()


class ShopifyQueries(unittest.TestCase):
    def test_orders_page_stays_under_the_cost_limit(self):
        # Shopify multiplies nested page sizes; 10 x 10 keeps a page's price
        # well under its 1,000-point limit. Raise these only after checking
        # the price with the Shopify-GraphQL-Cost-Debug header.
        self.assertLessEqual(transform.ORDERS_PAGE_SIZE * transform.LINES_PAGE_SIZE, 100)
        self.assertIn(f"orders(first: {transform.ORDERS_PAGE_SIZE},", transform.SHOPIFY_ORDERS_QUERY)
        self.assertIn(f"lineItems(first: {transform.LINES_PAGE_SIZE})", transform.SHOPIFY_ORDERS_QUERY)

    def test_both_queries_ask_for_the_same_line_fields(self):
        self.assertIn(transform._LINE_FIELDS, transform.SHOPIFY_ORDERS_QUERY)
        self.assertIn(transform._LINE_FIELDS, transform.SHOPIFY_ORDER_LINES_QUERY)

    def test_lines_have_page_info(self):
        self.assertIn("pageInfo", transform.SHOPIFY_ORDERS_QUERY.split("lineItems")[1])

    def test_more_lines_cursor(self):
        full = {"lineItems": {"pageInfo": {"hasNextPage": False, "endCursor": "c1"}, "nodes": []}}
        more = {"lineItems": {"pageInfo": {"hasNextPage": True, "endCursor": "c2"}, "nodes": []}}
        self.assertIsNone(transform.more_lines_cursor(full))
        self.assertEqual(transform.more_lines_cursor(more), "c2")
        self.assertIsNone(transform.more_lines_cursor({}))

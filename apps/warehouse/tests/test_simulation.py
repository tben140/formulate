"""
Run from the repository root: python3 -I -m unittest discover -s apps/warehouse/tests

SYNTHETIC DATA ONLY: these check the analysis's arithmetic on made-up
visitors with a known answer (simulation/simulate.py).
"""

import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "simulation"))

import simulate as sim  # noqa: E402


class Arithmetic(unittest.TestCase):
    def test_relative_lift_of_known_means(self):
        result = sim.relative_lift([1, 1, 0, 0] * 50, [1, 1, 1, 0] * 50)
        self.assertAlmostEqual(result.control, 0.5)
        self.assertAlmostEqual(result.treatment, 0.75)
        self.assertAlmostEqual(result.lift, 0.5)
        self.assertLess(result.low, 0.5)
        self.assertGreater(result.high, 0.5)

    def test_refuses_a_lift_on_nothing(self):
        with self.assertRaises(ValueError):
            sim.relative_lift([0, 0, 0], [1, 0, 0])

    def test_srm(self):
        self.assertAlmostEqual(sim.srm_p_value(500, 500), 1.0)
        # 450 v 550 of 1,000: chi-square 10, p ~ 0.0016.
        self.assertAlmostEqual(sim.srm_p_value(450, 550), 0.00157, places=4)
        self.assertLess(sim.srm_p_value(400, 600), sim.SRM_THRESHOLD)

    def test_required_visitors_matches_the_textbook(self):
        # 10% to 12% at alpha 0.05, power 0.8: about 3,841 per arm.
        self.assertAlmostEqual(sim.required_visitors(0.10, 0.20) / 2, 3841, delta=5)

    def test_simulate_splits_in_half(self):
        control, treatment = sim.simulate(10_000, 0.05, rng=random.Random(1))
        self.assertEqual(control.visitors + treatment.visitors, 10_000)
        self.assertAlmostEqual(control.visitors / 10_000, 0.5, delta=0.02)


class KnownAnswers(unittest.TestCase):
    """Few runs, so the bounds are loose; the report runs more."""

    def test_an_aa_test_rarely_finds_a_difference(self):
        result = sim.repeat(300, 3000, 0.05, 0.0, seed=3)
        self.assertLess(result["significant"], 0.10)
        self.assertLess(result["srm"], 0.02)

    def test_a_real_lift_is_found_and_bracketed(self):
        needed = sim.required_visitors(0.05, 0.30)
        result = sim.repeat(80, needed, 0.05, 0.30, seed=5)
        self.assertGreater(result["significant"], 0.6)
        self.assertGreater(result["interval_holds_true_lift"], 0.85)


if __name__ == "__main__":
    unittest.main()

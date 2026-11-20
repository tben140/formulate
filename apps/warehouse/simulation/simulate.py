"""
SYNTHETIC DATA ONLY. A check that the experiment analysis finds what it
should, on data where the answer is known (SHO-89).

Every visitor here is made up. Nothing in this file reads or writes real
data, and no number it prints is a result about the shop.

It does three things:

- `simulate` makes an experiment's visitors with a chosen conversion rate,
  order value and true lift, split 50/50 the way GrowthBook splits them;
- `analyse` approximates what GrowthBook's frequentist engine reports:
  relative lift with a delta-method confidence interval, and a sample ratio
  mismatch (SRM) check. It uses normal quantiles where GrowthBook uses
  Student's t (Welch); the two agree at the sample sizes a test needs, and
  differ on small samples;
- `required_visitors` says how many visitors a test needs to detect a lift.

Run it for a report (`python3 -I apps/warehouse/simulation/simulate.py`):
  - an A/A test, many times over, should show a significant difference in
    about 5% of runs and an SRM in about 0.1%;
  - a test with a real lift should find it in about 80% of runs at the size
    `required_visitors` gives, and its 95% interval should hold the true lift
    in about 95% of runs.

If those hold, the arithmetic is right. They say nothing about whether the
pipeline (assignment, exposure, the order join) is right: the A/A test on
real traffic checks that (docs/experiments.md).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from statistics import NormalDist
from typing import Sequence

_NORMAL = NormalDist()

#: GrowthBook's default SRM threshold: below this p-value it warns.
SRM_THRESHOLD = 0.001


@dataclass(frozen=True)
class Arm:
    """One arm's visitors: whether each ordered, and what they spent."""

    converted: tuple[bool, ...]
    revenue: tuple[float, ...]

    @property
    def visitors(self) -> int:
        return len(self.converted)


@dataclass(frozen=True)
class MetricResult:
    control: float
    treatment: float
    #: Relative lift, treatment / control - 1.
    lift: float
    low: float
    high: float
    p_value: float

    @property
    def available(self) -> bool:
        """False when the sample has no variance to test (see relative_lift)."""
        return not math.isnan(self.p_value)

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05


@dataclass(frozen=True)
class Analysis:
    conversion: MetricResult
    revenue: MetricResult
    srm_p_value: float

    @property
    def srm(self) -> bool:
        return self.srm_p_value < SRM_THRESHOLD


def simulate(
    visitors: int,
    conversion: float,
    lift: float = 0.0,
    order_value: float = 30.0,
    rng: random.Random | None = None,
) -> tuple[Arm, Arm]:
    """
    Two arms of made-up visitors. Each visitor lands in an arm with
    probability one half, orders with the arm's conversion rate, and an order
    is worth a lognormal amount averaging `order_value`. `lift` raises the
    treatment's conversion rate by that fraction; order value is the same in
    both arms, so revenue per visitor moves by the same lift.
    """
    if not 0 < conversion < 1 or not 0 < conversion * (1 + lift) < 1:
        raise ValueError("Conversion rates must stay between 0 and 1.")
    rng = rng or random.Random()
    sigma = 0.5
    mu = math.log(order_value) - sigma**2 / 2
    arms: list[tuple[list[bool], list[float]]] = [([], []), ([], [])]
    for _ in range(visitors):
        arm = rng.random() < 0.5
        rate = conversion * (1 + lift) if arm else conversion
        ordered = rng.random() < rate
        converted, revenue = arms[arm]
        converted.append(ordered)
        revenue.append(rng.lognormvariate(mu, sigma) if ordered else 0.0)
    return tuple(Arm(tuple(c), tuple(r)) for c, r in arms)  # type: ignore[return-value]


def _mean_var(values: Sequence[float]) -> tuple[float, float]:
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1) if n > 1 else 0.0
    return mean, var


def relative_lift(
    control: Sequence[float], treatment: Sequence[float], confidence: float = 0.95
) -> MetricResult:
    """
    Relative lift with a delta-method interval, a normal approximation of
    what GrowthBook's frequentist engine reports (see the module docstring).
    Raises if the control's mean is zero: a lift on nothing has no meaning.
    If the standard error is zero (a treatment where nobody ordered, say),
    the method can't test anything: the interval and p-value are NaN and
    `available` is False, rather than reporting "no difference".
    """
    mean_c, var_c = _mean_var(control)
    mean_t, var_t = _mean_var(treatment)
    if mean_c == 0:
        raise ValueError("The control's mean is zero; there's no lift to measure.")
    lift = mean_t / mean_c - 1
    se = math.sqrt(
        var_t / len(treatment) / mean_c**2 + mean_t**2 * var_c / len(control) / mean_c**4
    )
    if se == 0:
        return MetricResult(mean_c, mean_t, lift, math.nan, math.nan, math.nan)
    z = _NORMAL.inv_cdf(1 - (1 - confidence) / 2)
    p = 2 * (1 - _NORMAL.cdf(abs(lift) / se))
    return MetricResult(mean_c, mean_t, lift, lift - z * se, lift + z * se, p)


def srm_p_value(control_visitors: int, treatment_visitors: int) -> float:
    """Chi-square (one degree of freedom) against the expected 50/50 split."""
    total = control_visitors + treatment_visitors
    expected = total / 2
    chi2 = ((control_visitors - expected) ** 2 + (treatment_visitors - expected) ** 2) / expected
    # One degree of freedom: P(X > chi2) = erfc(sqrt(chi2 / 2)).
    return math.erfc(math.sqrt(chi2 / 2))


def analyse(control: Arm, treatment: Arm) -> Analysis:
    return Analysis(
        conversion=relative_lift(
            [float(c) for c in control.converted], [float(c) for c in treatment.converted]
        ),
        revenue=relative_lift(control.revenue, treatment.revenue),
        srm_p_value=srm_p_value(control.visitors, treatment.visitors),
    )


def required_visitors(
    conversion: float, lift: float, alpha: float = 0.05, power: float = 0.8
) -> int:
    """
    Visitors needed in total (both arms) for a two-sided test of `alpha` to
    detect a relative `lift` in a conversion rate with the given power.

    Planned with the variance `relative_lift` tests (the delta method on the
    ratio of means), not the textbook difference in proportions: the ratio's
    variance carries the control's noise scaled by (p2 / p1)^2, so the
    textbook figure under-sizes a test, badly for large lifts.
    """
    p1, p2 = conversion, conversion * (1 + lift)
    z = _NORMAL.inv_cdf(1 - alpha / 2) + _NORMAL.inv_cdf(power)
    per_arm = z**2 * (p2 * (1 - p2) + p2**2 * (1 - p1) / p1) / (p2 - p1) ** 2
    return 2 * math.ceil(per_arm)


def repeat(
    runs: int, visitors: int, conversion: float, lift: float, seed: int = 13
) -> dict[str, float]:
    """Run the same synthetic experiment many times and count what it found."""
    rng = random.Random(seed)
    significant = srm = covered = unavailable = 0
    for _ in range(runs):
        result = analyse(*simulate(visitors, conversion, lift, rng=rng))
        unavailable += not result.conversion.available
        significant += result.conversion.significant
        srm += result.srm
        covered += result.conversion.low <= lift <= result.conversion.high
    return {
        "runs": runs,
        "significant": significant / runs,
        "srm": srm / runs,
        "interval_holds_true_lift": covered / runs,
        "unavailable": unavailable / runs,
    }


def report() -> str:
    """The numbers docs/experiments.md quotes, regenerated."""
    base, mde = 0.03, 0.20
    needed = required_visitors(base, mde)
    lines = [
        "SYNTHETIC DATA. Not a result about the shop.",
        "",
        f"Visitors needed for a {mde:.0%} lift on a {base:.0%} conversion rate "
        f"(alpha 0.05, power 0.8): {needed:,} in total.",
    ]
    aa = repeat(1000, 4000, base, 0.0)
    lines.append(
        f"A/A, {aa['runs']} runs of 4,000 visitors: significant in {aa['significant']:.1%} "
        f"(expect ~5%), SRM in {aa['srm']:.1%} (expect ~0.1%)."
    )
    ab = repeat(200, needed, base, mde, seed=29)
    lines.append(
        f"A real {mde:.0%} lift, {ab['runs']} runs of {needed:,} visitors: found in "
        f"{ab['significant']:.0%} (expect ~80%); the 95% interval held the true lift in "
        f"{ab['interval_holds_true_lift']:.0%} (expect ~95%)."
    )
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())

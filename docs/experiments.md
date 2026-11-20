# Experiments: what this shop can and can't learn from them

A/B tests run on GrowthBook, for visitors who accept tracking
([ADR 0013](adr/0013-experiments-run-on-growthbook-for-consenting-visitors.md);
setup in [Integration: GrowthBook](integration-growthbook.md)). This note says
what the tests can show at this shop's size, how the analysis was checked, and
what to use instead when a test can't answer the question.

**The rule:** never present an underpowered result as a finding. A test that
hasn't reached the sample size it was planned for has no result, only a
number. Report it as "not enough visitors to tell", with the sample size it
reached and the one it needed.

## How many visitors a test needs

To detect a lift in the share of visitors who order, with the usual settings
(a 5% false-positive rate, two-sided, and an 80% chance of finding a real
effect):

| Conversion rate | Lift to detect | Visitors needed, both arms together |
| --------------- | -------------- | ----------------------------------- |
| 3%              | 50%            | 7,568                               |
| 3%              | 20%            | 33,406                              |
| 3%              | 10%            | 117,074                             |
| 3%              | 5%             | 436,682                             |
| 2%              | 20%            | 50,674                              |
| 2%              | 10%            | 177,512                             |

`required_visitors` in `apps/warehouse/simulation/simulate.py` computes these,
with the variance of the relative lift the analysis tests. That's more than
the textbook difference-in-proportions formula gives, most of all for large
lifts.
Most real changes to a product page move conversion by a few percent, not 20
or 50, so the realistic rows are the bottom ones.

Only visitors who accept tracking take part. On a site where half accept, the
visitors the shop needs are twice the table's figures.

**What that means here.** This is a demo store with no real customers: its
visitors are the owner and the people reviewing it. At that size no test can
detect a realistic lift, and none should be read as if it had. A real shop
would need tens of thousands of consenting visitors over the test's length
for a 20% lift, and hundreds of thousands for 5%.

So the experiment work here proves the **apparatus**, not any result:

1. Assignment is deterministic (`packages/experiments`, GrowthBook's v2
   hashing) and the same visitor sees the same variant.
2. Exposure is recorded once, only for visitors who were actually shown the
   variant (`experiment_viewed`).
3. Orders join back to exposures through the `_posthog_id` cart attribute.
4. The statistics find a known effect, and don't find one that isn't there
   (below).

## The A/A test

`product-page-aa` shows both arms the same page. Run on real traffic, it
checks the pipeline, not the page:

- **A sample ratio mismatch (SRM) is a reason to investigate.** A 50/50
  split never comes out exactly even, so a small gap (1,001 against 999) is
  normal. GrowthBook flags an SRM when the gap is too big for chance, below
  p = 0.001. That usually means assignment or exposure is losing people from
  one arm, so check the pipeline first; rarely, it is chance.
- **A significant difference is a reason to look, not proof of a fault.** At
  a 5% false-positive rate an A/A test shows one by chance about one time in
  twenty. Check the pipeline; if it's sound, run the test again.
- **Exposures and orders should line up**: every order with a `_posthog_id`
  whose visitor was exposed should appear in `attributed_orders`.

## Checking the statistics on synthetic data

`apps/warehouse/simulation/simulate.py` makes up visitors with a chosen
conversion rate, order value and true lift, splits them 50/50, and analyses
them much as GrowthBook's frequentist engine reports a result: relative lift
with a delta-method confidence interval, and an SRM check. It uses normal
quantiles where GrowthBook uses Student's t, so the two agree at the sample
sizes a test needs and differ on small samples. **All of its data
is synthetic**, and it says so in everything it prints.

`python3 -I apps/warehouse/simulation/simulate.py` reports, on its last run
(20 November 2026):

| Check                                                   | Found | Expected |
| ------------------------------------------------------- | ----- | -------- |
| A/A, 1,000 runs of 4,000 visitors: a significant result | 5.0%  | ~5%      |
| A/A, the same runs: an SRM                              | 0.0%  | ~0.1%    |
| A real 20% lift at the planned size: found              | 86%   | ~80%     |
| The same runs: the 95% interval holds the true lift     | 94%   | ~95%     |

The 86% comes from 200 runs; over 1,000 more runs the planned size found the
lift 83% of the time, close to the 80% it plans for. Its tests
(`apps/warehouse/tests/test_simulation.py`) repeat the same checks
with fewer runs and looser bounds, so they run in a couple of seconds.

## When a test can't answer: watching people use it

At this size, the right tool for "is this page better?" is moderated
usability sessions: five to eight people, each given a task ("find a
magnesium supplement for sleep and subscribe to it"), watched and asked to
think aloud. Five sessions can show the common problems a page has, though
not every one; they don't measure how big an effect is, and nobody should report them as if they did.

Use a test when the shop has the traffic in the table above, and sessions
until then. Either way, write down before starting what would count as a
result.

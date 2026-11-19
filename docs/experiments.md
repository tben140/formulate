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
| 3%              | 50%            | 5,030                               |
| 3%              | 20%            | 27,822                              |
| 3%              | 10%            | 106,416                             |
| 3%              | 5%             | 415,872                             |
| 2%              | 20%            | 42,212                              |
| 2%              | 10%            | 161,358                             |

`required_visitors` in `apps/warehouse/simulation/simulate.py` computes these.
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

- **A sample ratio mismatch (SRM) means a fault.** The split is 50/50, so an
  uneven count of exposed visitors means assignment or exposure is losing
  people from one arm. GrowthBook flags it below p = 0.001.
- **A significant difference is a reason to look, not proof of a fault.** At
  a 5% false-positive rate an A/A test shows one by chance about one time in
  twenty. Check the pipeline; if it's sound, run the test again.
- **Exposures and orders should line up**: every order with a `_posthog_id`
  whose visitor was exposed should appear in `attributed_orders`.

## Checking the statistics on synthetic data

`apps/warehouse/simulation/simulate.py` makes up visitors with a chosen
conversion rate, order value and true lift, splits them 50/50, and analyses
them the way GrowthBook's frequentist engine reports a result: relative lift
with a delta-method confidence interval, and an SRM check. **All of its data
is synthetic**, and it says so in everything it prints.

`python3 -I apps/warehouse/simulation/simulate.py` reports, on its last run
(19 November 2026):

| Check                                                   | Found | Expected |
| ------------------------------------------------------- | ----- | -------- |
| A/A, 1,000 runs of 4,000 visitors: a significant result | 5.0%  | ~5%      |
| A/A, the same runs: an SRM                              | 0.0%  | ~0.1%    |
| A real 20% lift at the planned size: found              | 78%   | ~80%     |
| The same runs: the 95% interval holds the true lift     | 94%   | ~95%     |

Its tests (`apps/warehouse/tests/test_simulation.py`) repeat the same checks
with fewer runs and looser bounds, so they run in a couple of seconds.

## When a test can't answer: watching people use it

At this size, the right tool for "is this page better?" is moderated
usability sessions: five to eight people, each given a task ("find a
magnesium supplement for sleep and subscribe to it"), watched and asked to
think aloud. Five sessions find most of the problems a page has; they don't
measure how big an effect is, and nobody should report them as if they did.

Use a test when the shop has the traffic in the table above, and sessions
until then. Either way, write down before starting what would count as a
result.

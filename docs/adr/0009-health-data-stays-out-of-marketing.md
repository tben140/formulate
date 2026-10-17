# ADR 0009 — Health and test data stay out of marketing and recommendations

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

Three ideas came up together while planning push notifications and
personalisation, and all of them involve health data:

1. **Apple Health (HealthKit).** The app could read sleep, workouts or heart
   rate, or write the nutrients a shopper takes.
2. **Shopper-provided blood test results**, to recommend products for low
   levels.
3. **Genetic tests**, for "DNA-based" recommendations.

These are the most tempting personalisation signals a supplements brand could
have, and also the most restricted. Five sets of rules apply. They overlap, and
any one of them is enough to stop an idea:

| Rule set                             | What it says, for this project                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple App Review Guideline 5.1.3** | Data from HealthKit may not be used for advertising, marketing or use-based data mining, or shared with third parties, except to improve the user's own health management or for consented research. Unchanged since HealthKit launched; checked again 2026-10-15. Apps that interpret health data get extra scrutiny under 1.4.1 (physical harm) |
| **UK GDPR, Article 9**               | Health and genetic data are special category data: explicit consent, a DPIA, minimisation, strong security, and stricter rules for automated decisions. The Data (Use and Access) Act 2025 eased other areas (for example analytics cookies) and left this in place                                                                               |
| **MHRA (medical devices)**           | Software that interprets a test result and recommends something to address it may be software as a medical device, which brings registration and evidence requirements. It depends on intended purpose and wording                                                                                                                                |
| **ASA / CAP Code**                   | Food supplements may only use authorised health claims and may not make medicinal claims. "Your level is low, so take this" reads as one. The ASA has ruled against DNA-based nutrition claims before                                                                                                                                             |
| **Vendor terms**                     | Klaviyo and PostHog are not places for special category data. Klaviyo's acceptable-use terms restrict sensitive health data (to confirm against current terms)                                                                                                                                                                                    |

## Decision

**Health data, from Apple Health or from tests, never reaches marketing,
segmentation, recommendations or any third-party tool.**

What is allowed:

- **Writing to Apple Health.** When a shopper taps "Taken ✓" on a reminder, the
  app may write that product's nutrients (for example magnesium 200 mg) to
  Apple Health, with opt-in. Write-only, from product data the store already
  publishes.
- **On-device features for the shopper's own routine.** For example their
  logged intake against reference intakes (NRVs), stated as amounts with no
  claims, or a local reminder after a workout Health recorded. The data stays
  on the phone, and nothing derived from it is sent anywhere.
- **Personalisation from goals and preferences instead.** A routine quiz
  ("what matters to you: energy, focus, training, sleep? vegan? budget?")
  stores preferences, worded as goals, not symptoms. It feeds recommendations,
  segments and offers like any other preference.

What is not built:

- Recommendations, segments, offers or push timing based on HealthKit data.
- Uploading or entering blood test results.
- Anything based on genetic tests.

## Alternatives considered

**HealthKit-based targeting** ("slept badly → magnesium offer"). Forbidden by
5.1.3 outright, and likely to be read as intrusive even where it were
allowed.

**Results kept on the phone**: the shopper types in their own values, and the
app shows products containing those nutrients and suggests speaking to their
GP. Smaller GDPR exposure, because nothing leaves the device. Rejected because
the medical-device question turns on interpreting a result, which this still
does, and the wording needed to stay clear of medicinal claims leaves little of
the feature. Would need legal advice before being reconsidered.

**A real test-based service**: a partner lab, results reviewed by a qualified
practitioner, a separate encrypted UK or EU data store, a DPIA and legal
sign-off. This is how UK companies selling test-based supplements operate. It
is a different business model, not a feature, and out of scope for a demo
store.

**Genetic recommendations.** The weakest evidence base, the most sensitive data
and the clearest advertising risk. Not considered further.

## Consequences

- Personalisation rests on behaviour (orders, browsing, subscriptions) and
  stated preferences (the quiz). Both are weaker signals than health data, and
  both are lawful to use with the consent the store already collects.
- The Apple Health integration is deliberately one-directional and small. Someone
  looking at it later may think it was left unfinished. It wasn't: reading more
  and doing more with it is what this record rules out.
- Quiz wording has to stay on goals. "Focus" is a preference; "I struggle to
  concentrate" starts to describe a health condition. Copy changes to the quiz
  should be checked against this record.
- Any supplement claim in quiz results, push copy or recommendations has to use
  authorised wording. A short wording guide sits alongside this record.

## Revisit when

- Double Helix becomes a real trading business able to partner with an
  accredited lab and a qualified practitioner, with legal advice. Then the
  test-based service above is worth costing properly.
- Apple changes Guideline 5.1.3, or the UK changes how special category data
  may be used. Neither looked likely when checked in October 2026.

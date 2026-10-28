# Compliance register: subscriptions

What the subscription rules ask of this store, what already meets them, and
what's still open. Written for building against, not as legal advice: before
real customers, a lawyer should read the final rules against the live flows.

Two sets of rules matter. The **UK subscription contracts regime** (DMCC Act 2024) applies to every UK subscriber. **California's Automatic Renewal Law**
applies only to customers in California, which matters only if the store sells
to the US.

## 1. Cancelling a subscription (SHO-91)

The principle both sets of rules share: **cancelling must be at least as easy
as subscribing.** Save offers are fine; obstruction isn't. The flows are in
#136 (web `/account/subscriptions/[id]/cancel`, the app's matching screen).

| Rule                                                                                  | Status                                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Cancel online, from the account area, without contacting anyone                       | ✅ Web and the app                                                                                          |
| No more steps than subscribing (counts below)                                         | ✅ 5 taps to cancel from any page; about the same to subscribe from a product page                          |
| Save offers once, on one screen, with the cancel button always visible alongside them | ✅ Offers sit above the cancel button on the same screen                                                    |
| The cancel button is never hidden, greyed out, delayed or below the fold              | ✅ Since #136's SHO-91 fix: the optional reasons start closed, so the button is on a phone's first screen   |
| A reason is optional                                                                  | ✅ Reasons and comment are optional; with none given, "other" is recorded                                   |
| At most one confirmation                                                              | ✅ The cancel page is the confirmation: one press                                                           |
| Confirmed at once on screen and by email                                              | ✅ "Your subscription is cancelled…" on return; Recharge's cancelled flow in Klaviyo sends the email (live) |
| The same on both platforms                                                            | ✅ The app's screen mirrors web's, step for step                                                            |

**Step counts**, from any page, signed in:

| Subscribing (product page)                     | Cancelling                       |
| ---------------------------------------------- | -------------------------------- |
| 1. Choose "Subscribe & save"                   | 1. Account                       |
| 2. Add to cart                                 | 2. Subscriptions                 |
| 3. Checkout                                    | 3. The subscription              |
| 4. Fill in the checkout (email, address, card) | 4. Cancel subscription           |
| 5. Pay                                         | 5. Cancel subscription (confirm) |

Signing in takes an email code on both sides: Shopify's checkout asks for the
email too, so neither side counts it.

**Checked by hand on each change to the cancel flow:** follow it on a phone and
on desktop; at no point should the shopper have to scroll, wait, answer, or
decline more than once to cancel.

## 2. UK: subscription contracts regime (DMCC Act 2024)

**When:** January 2027. The Prime Minister brought it forward from spring 2027
on 10 August 2026. Draft regulations, the Consumer Subscription Contracts
(Cancellation and Information) Regulations 2026, were laid before Parliament on
19 October 2026 with draft guidance. **Recheck everything below against the
final text when it's made.**

| Obligation                                                                                                                                             | This store                                                               | Open                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key information** together, apart from the full terms, as close as possible to sign-up                                                               | The renewal line by the button (#141): price, how often, cancel any time | Compare its wording with the final regulations                                                                                                             |
| **Express acknowledgement** of the payment obligation at the final sign-up step                                                                        | Checkout is Shopify's, so its wording at payment is Shopify's            | Check what Shopify's checkout says at payment for a subscription, and whether it counts. If not, a checkout UI extension (the #122 stack) can add a line   |
| **Reminder notices** before renewals: once every six months for regular payments, on a durable medium (email), with their purpose immediately apparent | Recharge's "upcoming order" flow emails before every charge (live)       | Check the email's subject and first line say it's a renewal reminder, and that it says how to cancel                                                       |
| **Renewal cooling-off**: 14 days after a "relevant renewal" (the first payment after a free or discounted trial, or a renewal onto 12 months or more)  | No trials and no 12-month plans today, so probably none apply            | Ask: does the 10% sign-up code on a first subscription order make the second order the end of a "discounted trial"? If so, refunds and a notice are needed |
| **Easy exit**: cancel online, accept any clear statement of cancelling, send an end-of-contract notice on a durable medium                             | Section 1; Recharge's cancelled email                                    | Support emails saying "cancel" must be acted on too: a runbook line for whoever reads the inbox                                                            |

## 3. California: Automatic Renewal Law (AB 2863, since 1 July 2025)

Applies to contracts made, amended or extended since 1 July 2025 with
customers in California.

| Obligation                                                                                                                     | This store                                                                                   | Open                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Price-change notice** 7 to 30 days before a price goes up, with how to cancel                                                | Nothing yet                                                                                  | A process: change subscription prices with a future date, and a Klaviyo flow (or a one-off campaign) that lands 7–30 days ahead with old and new price and the cancel link. Which Recharge event fires on a price change still needs checking |
| **Annual reminder** of the product, its charges and how to cancel, in the medium the customer signed up through                | The per-charge "upcoming order" email, if it names the product, the charge and how to cancel | Check its content; then it more than covers a yearly reminder                                                                                                                                                                                 |
| **Click to cancel**: online if signed up online; a save offer only with a prominent cancel button shown continuously beside it | Section 1                                                                                    | None                                                                                                                                                                                                                                          |

## Sources

- Fenwick, [California tightens requirements for automatically renewing subscriptions](https://fenwick.com/insights/publications/california-tightens-requirements-for-automatically-renewing-subscriptions)
- Kutak Rock, [California's latest Automatic Renewal Law amendments take effect in July 2025](https://ktslaw.com/insights/alert/2024/10/california-latest-automatic-renewal-law-amendments-take-effect-in-july-2025)
- TLT, [DMCC Act subscription contracts regime brought forward by the PM](https://www.tlt.com/insights-and-events/insight/dmcc-act-subscription-contracts-regime-brought-forward-by-the-pm-what-do-businesses-need-to-know) (updated October 2026)
- Taylor Wessing, [Subscription contracts: new regime delayed to spring 2027](https://www.taylorwessing.com/en/insights-and-events/insights/2026/04/subscription-contracts) (April 2026, before the change of date)
- Osborne Clarke, [Subscription contracts regime to take shape by 2027](https://www.osborneclarke.com/insights/uk-digital-markets-competition-and-consumers-act-subscription-contracts-regime-take-shape)

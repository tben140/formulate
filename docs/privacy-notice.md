# Privacy notice: draft wording

The wording for Double Helix's privacy notice and cookie table, written from
what the code actually stores and sends. It goes into Shopify's privacy policy
(Settings → Policies), which web, the app and the theme all show at
`/policies/privacy-policy`.

> ⚠️ **Draft, not legal advice.** Double Helix is a demo store, not a trading
> business: this is the notice a real launch would need, checked against the
> code. Before real customers, have someone qualified review it, fill in the
> `[brackets]`, and add the legitimate interests assessment ADR 0010 calls for
> if it's accepted.

**Keep it in step with the code.** Each row names the code or PR that creates
it. When a PR adds, renames or removes a cookie, storage key or service, update
this file in the same PR. Items marked _(PR #…)_ aren't on `main` yet; drop the
marker when they merge.

---

## The notice

### Who we are

Double Helix sells food supplements online through our website, our app and
our Shopify store. We are the controller of the personal data described here.
Contact: `[privacy contact email]`, `[postal address]`.

### What we collect, and why

| What                                                                                   | Why                                                                                             | Lawful basis                                   |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Your order: name, addresses, email, phone, what you bought                             | To take payment, deliver and handle returns                                                     | Contract                                       |
| Your account (if you create one): email, order history                                 | To show your orders and manage subscriptions                                                    | Contract                                       |
| Your subscriptions: products, frequency, next charge date                              | To run the subscription you chose                                                               | Contract                                       |
| Your email address, if you sign up for emails or back-in-stock alerts                  | To send what you asked for                                                                      | Consent (you can unsubscribe in any email)     |
| What you browse and add to your basket, **only if you accept tracking**                | Reminder emails, and to understand how the shop is used                                         | Consent                                        |
| Advertising cookies and conversions, **only if you accept tracking** _(PR #101, #102)_ | To measure and target our adverts                                                               | Consent                                        |
| Your routine quiz answers: your **goals and preferences**, never health information    | To suggest a routine; kept on your device only if you press "Save my routine" _(PR #124, #125)_ | Legitimate interests (a feature you asked for) |
| Error reports from the website and app _(PR #97, #98)_                                 | To find and fix faults                                                                          | Legitimate interests                           |

We don't ask about your health, and we don't collect health, blood-test or
genetic data (ADR 0009). We don't sell your personal data.

### Tracking is off until you choose

- **Website:** the banner asks before anything is tracked. Until you accept,
  no tracking script loads and no tracking cookie is set. Change your mind any
  time from **Cookie preferences** in the footer.
- **Visitors in the US:** while the banner is still waiting for your answer,
  the page remembers what you view and add to your basket, in the page itself
  only. If you then accept, that activity from the same page is sent too. If
  you decline or leave, it's thrown away. Outside the US nothing from before
  your choice is kept or sent. _(PR #135)_
- **App:** the same question, in the app. Change it from **Privacy choices** in
  the app's footer.
- **Checkout:** your choice goes with your basket to Shopify's checkout, so
  checkout respects it too (PR #123).

### Who we share it with

These companies process data for us, under contracts that limit what they can
do with it:

| Who                                                      | What for                                                      | Where                               |
| -------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| Shopify                                                  | The shop, checkout, payments, orders                          | `[confirm: Canada, Ireland, US]`    |
| Recharge                                                 | Subscriptions                                                 | `[confirm]`                         |
| Klaviyo                                                  | Email and, in the app, notifications                          | `[confirm]`                         |
| PostHog                                                  | How the shop is used (statistics) _(PR #93, #107, #108)_      | EU                                  |
| Sentry                                                   | Error reports, with personal data removed _(PR #97, #98)_     | EU (Germany)                        |
| Vercel                                                   | Hosting the website; visit statistics without cookies         | `[confirm region]`                  |
| Cloudflare                                               | Our back-end service (back-in-stock alerts, account deletion) | `[confirm]`                         |
| Judge.me                                                 | Product reviews you choose to write _(PR #94)_                | `[confirm]`                         |
| Google, Meta, TikTok, Pinterest, Snap, Reddit, Microsoft | Advertising, only with your consent _(PR #101, #102)_         | Outside the UK, under `[safeguard]` |

### How long we keep it

`[Orders: 6 years for tax. Accounts: until you delete it. Marketing: until you
unsubscribe. Statistics and error reports: the provider's retention, set to
[n] months. Cookies: see the table below.]`

### Your rights

You can ask for a copy of your data, correct it, delete it, object to or
restrict how we use it, and take it elsewhere. You can delete your account
yourself from your account page (PR #88). Contact `[privacy contact email]`.
If you're unhappy with our answer, you can complain to the Information
Commissioner's Office (ico.org.uk).

---

## Cookies and stored data

### Website

| Name                                                                                                                                                                | Set by                                     | Purpose                                                                   | Needs consent?                         | Lasts                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| `formulate_tracking_consent`                                                                                                                                        | Us                                         | Remembers your tracking choice                                            | No (strictly necessary)                | 180 days                   |
| `formulate_cart`                                                                                                                                                    | Us                                         | Your basket                                                               | No (strictly necessary)                | 10 days                    |
| `formulate_buyer_email`                                                                                                                                             | Us                                         | Your email after you sign up, so your basket is yours                     | No (part of the sign-up you asked for) | 10 days                    |
| `dh_routine`                                                                                                                                                        | Us                                         | Your saved routine quiz answers, only after "Save my routine" _(PR #124)_ | No (a feature you asked for)           | 1 year                     |
| `__kla_id` and other `__kla…`, plus local storage `klaviyoOnsite` and similar                                                                                       | Klaviyo                                    | Reminder emails                                                           | **Yes**                                | Klaviyo's setting          |
| Local storage `formulate_analytics` (and session storage `formulate_ph_session`)                                                                                    | PostHog, via us                            | Shop statistics _(PR #93, #108)_                                          | **Yes**                                | Until you withdraw consent |
| `_ga`, `_ga_*`, `_gid`, `_gcl_*`                                                                                                                                    | Google                                     | Advertising _(PR #101)_                                                   | **Yes**                                | Google's settings          |
| `_fbp`, `_fbc`                                                                                                                                                      | Meta                                       | Advertising _(PR #101)_                                                   | **Yes**                                | Meta's settings            |
| `_ttp`, `_tt_enable_cookie`, `_pin_unauth`, `_pinterest_ct_ua`, `_epik`, `_derived_epik`, `_scid…`, `_sctr`, `_schn`, `_rdt_uuid`, `_rdt_cid`, `_uetsid`, `_uetvid` | TikTok, Pinterest, Snap, Reddit, Microsoft | Advertising _(PR #102)_                                                   | **Yes**                                | Each provider's setting    |

Vercel's visit statistics use no cookies.

### Shopify store and checkout

| Name                 | Purpose                                 | Needs consent?          |
| -------------------- | --------------------------------------- | ----------------------- |
| `_shopify_essential` | Shopify's basket, checkout and security | No (strictly necessary) |
| `_shopify_analytics` | Shopify's statistics                    | **Yes**                 |
| `_shopify_marketing` | Shopify's marketing measurement         | **Yes**                 |

### App (stored on your phone)

| Name                          | Purpose                                                      | Needs consent?               |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------- |
| `formulate.cart.id`           | Your basket                                                  | No (strictly necessary)      |
| `formulate.analytics.consent` | Your tracking choice _(PR #93, #107)_                        | No (strictly necessary)      |
| `formulate.analytics.id`      | Shop statistics _(PR #93)_                                   | **Yes**                      |
| `formulate.routine.answers`   | Your saved routine, only after "Save my routine" _(PR #125)_ | No (a feature you asked for) |
| Klaviyo's app SDK storage     | Reminders and notifications _(PR #107)_                      | **Yes**                      |

---

## Notes for whoever finalises this

- **Shopify's consent script** sends one diagnostic message before a choice is
  made: its own timing check, with the shop and browser type, no visitor id
  (SHO-170 trial). Mention it if Hydrogen stage 1 is adopted.
- **ADR 0010**, if accepted, moves basic statistics to "on unless you switch
  it off", with a per-session id. The PostHog rows and the "Tracking is off"
  section change then.
- **The ad tags** don't fire until consent, and server-side conversions
  (Meta's Conversions API) only carry an event for a shopper who accepted.
- **Judge.me** reviews are public, including the name a reviewer chooses.

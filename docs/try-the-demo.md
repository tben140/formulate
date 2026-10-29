# Try the demo

> **Draft.** Nothing here is published yet. The bracketed items are
> decisions or values the store owner fills in. Parts marked _after the batch_
> depend on PRs still in review.

Double Helix is one Shopify store sold through three storefronts: a headless
web store (Next.js), a native app (Expo) and a Liquid theme. All three share
one catalogue, one cart model and one subscription setup. This page tells a
reviewer where to find each one, what to try, and what's real.

## What's real and what isn't

- **The store is a Shopify development store.** Checkout runs in test mode:
  nobody is charged and nothing ships. Every page says so in a bar at the top.
- **Pay with the test card:** card number `1`, any future expiry date, any
  security code, any name. `2` shows a decline.
- **Orders are real orders** in Shopify. A subscription purchase also creates
  a real Recharge subscription, which you can then manage.
- **Development stores are always password protected.** Browsing the web store
  needs no password. Checkout, and the whole Liquid theme, ask for the store's
  password first: **[given on request]**.

## Where to find it

| Storefront     | Link                                                                        | Notes                                                             |
| -------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Web (headless) | [Demo web store](https://web-six-murex-18.vercel.app) (until a real domain) | The main demo                                                     |
| iOS app        | **[TestFlight public link]**                                                | Checkout opens in Shopify's native sheet, after the password page |
| Android app    | **[EAS internal distribution link or QR]**                                  | _After the batch_                                                 |
| Liquid theme   | **[the store's URL]**                                                       | Same features, built the theme way                                |
| Source         | [Source on GitHub](https://github.com/tben140/formulate)                    | Start with the README and `docs/architecture.md`                  |

## A ten-minute tour

1. **Home → "Find your routine".** Answer the quiz (goals, diet, format,
   budget). The routine comes from the store's own data, so changing a goal's
   products in Shopify changes the result with no deploy. _After the batch._
2. **A product page.** Switch between one-time and the 30-, 60- and 90-day
   plans. The price is Shopify's own for each plan, with the renewal terms by
   the button.
3. **Add to cart.** The drawer slides in. Change a quantity: it shows straight
   away and undoes itself with a message if the store refuses. Watch the
   free-delivery bar move. _Instant changes are after the batch._
4. **Checkout** with the password and the test card above. Subscribe to
   something, so the next step has data.
5. **Your account.** Sign in with your own email. Shopify sends a one-time
   code, so there's no shared demo password. You'll see your order, and your
   subscription in the portal: skip, reschedule, change frequency, pause and
   cancel. _The portal is after the batch._
6. **The same on the app**, from the TestFlight link: the tab bar, the cart
   sheet, and Shopify's native checkout sheet.
7. **The same on the theme**, to compare a Liquid build of the same features.

**What to look for:**

- Keyboard and screen-reader behaviour: the cart drawer traps focus and gives
  it back, and errors are announced.
- Speed: Lighthouse budgets are enforced in CI on web and the theme.
- Every surface showing the same prices, plans and promises.

## Decisions for the owner

1. **A real domain.** About £10 a year; it's also what Klaviyo's sending domain
   needs. Until then the `vercel.app` address works.
2. **iOS distribution.** TestFlight works today (build 3) with invited testers.
   A **public link** lets anyone join without an invite. It needs Apple's beta
   review of the build, usually a day or so.
3. **Android.** An EAS internal-distribution build gives a download link and a
   QR code, free. No Play Store listing is needed for a demo.
4. **Demo credentials.** Shopify's customer accounts sign in with an emailed
   code, so one shared demo login can't work. A reviewer can place a test order
   and use their own email, as in step 5 above. Or we build a read-only
   "sample subscription" view that needs no sign-in. Which do you want?
5. **Sharing the store password.** It can't go in this public repository.
   Options:
   - "on request" (the default above);
   - a line on a page that isn't in the repo, such as the portfolio site or a
     CV;
   - ending the password requirement, which needs a paid Shopify plan.
6. **How long it stays up, and what it costs.**

   | Service         | Plan               | Cost now         |
   | --------------- | ------------------ | ---------------- |
   | Shopify         | Development store  | Free             |
   | Vercel          | Hobby              | Free             |
   | Cloudflare      | Workers free       | Free             |
   | Recharge        | **[current plan]** | **[£]**          |
   | Klaviyo         | Free tier          | Free             |
   | Apple Developer | Program membership | $99 a year       |
   | Domain          | Not bought yet     | About £10 a year |

   If it lapses:
   - **Shopify:** a development store doesn't expire while it's in use.
   - **Vercel:** if the free plan's monthly allowance runs out, the site pauses
     until the month resets (75% of the CDN request allowance was used by 26 October, mostly by preview builds).
   - **TestFlight:** builds expire after 90 days, so the app needs a fresh build
     each quarter.

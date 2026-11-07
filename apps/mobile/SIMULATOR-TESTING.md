# Testing the app in the iOS Simulator with an agent

How an agent (Claude Code or Cursor, on a Mac) tests `apps/mobile` in the iOS
Simulator through [Argent](https://docs.swmansion.com/argent/), and what it
checks. It covers what the droplet can't: Expo web has no cart (secure-store),
and native layout, safe areas and gestures only show on a device or simulator.

## Rules for the agent

- **Read only, as far as the repo is concerned.** Don't commit, push, open PRs
  or change branches other than the ones named in a run. Don't edit app code
  to make a check pass; report it.
- **Secrets:** never print, copy or paste the contents of
  `apps/mobile/.env.local`. Everything in it is public by design, but it still
  stays out of chat, reports and screenshots of a terminal.
- **The store is a shared dev store.** Don't change products, prices, stock,
  discounts or customers. Stop at Shopify's checkout page; never pay.
- **Email and SMS forms:** don't submit one unless the person running the
  test gives an address to use. Klaviyo drops test-looking addresses silently
  (`packages/analytics/src/subscribe.ts`), so a made-up one proves nothing.
- **Processes:** stop only what you started (Metro, the Simulator).
- **Brand:** the shop is "Double Helix". Report what the screen says.

## Setup (once per Mac)

1. Xcode installed and opened once, with an iOS runtime. Check:
   `xcrun simctl list devices available` lists iPhones.
2. Argent installed globally and registered: `claude mcp list` shows it.
3. From the repo root: `pnpm install`.
4. `apps/mobile/.env.local`, copied from `.env.example` and filled in by the
   person running the test (Storefront public token, store domain, Klaviyo
   public key, `EXPO_PUBLIC_API_BASE_URL`).
5. Start Metro: `pnpm --filter @formulate/mobile dev`, then press `i`. Expo Go
   installs into the booted simulator and opens the app.

Switching branch: stop Metro, `git checkout <branch>`, `pnpm install`, start
Metro again with `--clear`.

## Devices

Run the core checks on each:

| Simulator           | Why                                    |
| ------------------- | -------------------------------------- |
| iPhone SE (3rd gen) | Smallest screen, home button, no notch |
| iPhone 17           | The usual size, Dynamic Island         |
| iPhone 17 Pro Max   | Largest; layouts that stretch          |

Use whatever current equivalents the installed runtime offers.

## Core checks

Each check: what to do, then what should be true. Take a screenshot of each
end state.

### 1. Launch and home

- Cold start the app. **Expect:** no red error screen or yellow warnings, home
  content loads within a few seconds, nothing under the status bar or the
  home indicator.

### 2. Browse

- Open a collection, scroll to the end. **Expect:** products load as you
  scroll; images are sharp, not stretched.
- Search for "magnesium". **Expect:** relevant results; the keyboard doesn't
  cover the field or the first result.

### 3. Product page

- Open Magnesium Glycinate. **Expect:** title, price, images, description with
  its headings and lists intact.
- Choose **200 mg**. **Expect:** marked sold out and can't be added. (The demo
  store keeps 200 mg at 0 on purpose: `docs/demo-store.md`.)
- Choose an in-stock strength. **Expect:** add to cart is enabled.

### 4. Subscribe and save

- Switch between one-time and subscription. **Expect:** the price changes to
  the subscription price, the saving is stated and right (check the maths),
  and the delivery frequency is shown.

### 5. Cart

- Add a one-time item and a subscription item. **Expect:** both appear with
  the right price and purchase type; the count on the cart icon updates.
- Change a quantity, remove a line. **Expect:** totals update; an empty cart
  says so.
- Kill and relaunch the app. **Expect:** the cart is still there (stored in
  secure-store, which is why this can't be tested on web).
- Tap checkout. **Expect:** Shopify's checkout opens with the same lines and
  prices. **Stop there.**

### 6. Accessibility and display

- Settings → Accessibility → Larger Text, at the largest size. **Expect:**
  text wraps rather than clipping; buttons still reachable.
- Dark mode on. **Expect:** everything readable; no white boxes or invisible
  text.
- Turn VoiceOver on, swipe through the product page. **Expect:** every image,
  button and option has a sensible label, and options announce whether
  they're selected.
- Rotate on the product page. **Expect:** either it stays portrait, or the
  layout holds.

### 7. Links

- `xcrun simctl openurl booted "<expo url>/--/products/magnesium-glycinate"`
  (the Expo Go URL Metro prints, plus the path). **Expect:** the product opens
  directly.

## Branch-specific checks

A run names one or more PR branches. For each, run the core checks on one
device (iPhone 17), plus the PR's own checks below if listed, and compare
against `integration/october-batch` if anything looks different.

| PR   | Branch                               | Also check                                                                                                                                                                                                          |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #234 | `tben140/expo-58-patches`            | Nothing new: it's dependency patches. Any difference from the base is a bug.                                                                                                                                        |
| #231 | `tben140/drop-node-forge-fast-track` | Metro starts and the app loads after a fresh `pnpm install`.                                                                                                                                                        |
| #86  | `tben140/account-preview-in-expo-go` | Account tab: Expo Go explains why real sign-in can't work there; **Preview with sample data** shows orders, order detail, subscriptions and upcoming deliveries under a preview banner; **Exit preview** leaves it. |

Get a PR's exact branch with `gh pr view <n> --json headRefName`.

## Report

Write `~/Desktop/double-helix-sim-results/<date>/report.md`, screenshots
beside it, named `<device>-<check>.png`. In the report:

- per branch and device, each check as **pass**, **fail** or **couldn't run**
  (with why);
- for each fail: steps, what happened, what was expected, the screenshot;
- anything odd that isn't a fail (slow, janky, ugly) under **Notes**.

Then, if `gh` is signed in on the Mac, post the summary for each PR as a
comment on that PR. Otherwise leave the report for the person running the
test to bring back.

# apps/web end-to-end tests

Playwright, against the **real store** and a **production build** of the app.

```bash
pnpm --filter @formulate/web test:e2e              # builds, serves on :3200, runs
E2E_BASE_URL=https://… pnpm --filter @formulate/web test:e2e   # against a running site
pnpm --filter @formulate/web exec playwright install chromium   # once per machine
```

Needs `apps/web/.env.local` with a working Storefront token (see
`apps/web/.env.example`). Each test uses a fresh browser context, so each makes
its own throwaway cart on the store. That's harmless on the demo store and is
why this suite isn't part of `turbo test`.

Two projects run every spec: `desktop` (1280px) and `phone` (iPhone 13 metrics
in Chromium). Keyboard specs run on desktop only.

## The campaign on the day

`campaign.spec.ts` checks the Black Friday campaign as shoppers will see it
(banner, countdown, campaign prices for one-time but not subscriptions, the
campaign page). The server decides what's live from its clock, so the spec
only runs with a preview time in the campaign's last day, on a server the
suite starts itself; otherwise it skips:

```bash
pnpm --filter @formulate/web test:e2e:campaign     # CAMPAIGN_PREVIEW_AT=2026-11-30T20:00:00Z
CAMPAIGN_PREVIEW_AT=2026-11-30T20:00:00Z pnpm --filter @formulate/web test:e2e   # every spec with the campaign live
```

Run the second before a campaign starts: it found the campaign box's text
failing colour contrast, which the suite can't see while no campaign is live.
A server you already have running on :3200 is reused, preview time or not, so
stop it first.

## The campaign's four states, as screenshots

`campaign-states.spec.ts` screenshots the parts a campaign changes (banner,
home hero, product page box, campaign page header) at four preview times:
upcoming, live, last day and ended. `pnpm --filter @formulate/web
test:e2e:campaign-states` runs all four; add `--update-snapshots` after a
deliberate change. Baselines are in `e2e/campaign-states.spec.ts-snapshots/`
(Linux Chromium, as CI). A part that's meant to be absent in a state (no
banner before the start) is recorded as absent.

## Conventions

- **Find things the way a person would**: by role and accessible name
  (`getByRole("button", { name: "Add to cart" })`), not by class. A test that
  can't find a control by its name has found an accessibility bug.
- **Known bugs are `test.fail()` with their ticket.** The test describes the
  correct behaviour and passes while the bug exists. When the fix merges,
  Playwright reports it as _unexpectedly passing_: delete the `test.fail` line
  then.
- **Stock-dependent tests say so.** Each one states the stock it needs in its
  own comment; the one today needs **Magnesium Glycinate 200 mg at 0
  available**. Check the store before the code if one fails after a stock
  reset. The full stock plan is `docs/demo-store.md` (added with #26).

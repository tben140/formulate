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

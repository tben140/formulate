import { expect, test } from "@playwright/test";

/**
 * Observed time to content: how long a page's heading takes to exist in the
 * document, timed by the browser from navigation start (SHO-68).
 *
 * Why this exists alongside Lighthouse: Lighthouse CI simulates a slow phone
 * from one fast load, and a Next.js page streams its first bytes at once. A
 * deliberate 2 s server wait on the product page still scored 0.93 there
 * (SHO-29, PR #82), because the simulation never saw the slow body. This
 * measures what actually arrives, so a slow server render fails here.
 *
 * Unthrottled, from wherever the suite runs, so the budget is generous to the
 * network and strict about the server: it covers a transatlantic round trip
 * with room to spare, and not a 2 s regression on top of it.
 */
const BUDGET_MS = 1500;
const RUNS = 3;

const PAGES = [
  { path: "/products/magnesium-glycinate", name: "the product page" },
  { path: "/collections/best-sellers", name: "a collection" },
];

/** The middle of three, so one slow run neither passes nor fails a PR. */
const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;

for (const { path, name } of PAGES) {
  test(`${name} shows its heading within ${BUDGET_MS} ms`, async ({ page }, testInfo) => {
    // Network timing, not layout: one project measures it.
    test.skip(testInfo.project.name !== "desktop", "measured once, on desktop");

    const timings: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      // `commit`, so the clock below isn't waiting on the whole load event.
      await page.goto(path, { waitUntil: "commit" });
      const handle = await page.waitForFunction(() =>
        document.querySelector("main h1") ? performance.now() : null,
      );
      timings.push(Number(await handle.jsonValue()));
    }

    testInfo.annotations.push({
      type: "timings",
      description: `${path}: ${timings.map((t) => Math.round(t)).join(", ")} ms`,
    });
    expect(median(timings), `heading times: ${timings.join(", ")}`).toBeLessThan(
      BUDGET_MS,
    );
  });
}

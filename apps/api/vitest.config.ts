import { defineConfig } from "vitest/config";

/**
 * `cloudflare:workers` is a runtime module that only exists inside `workerd`,
 * so Node cannot resolve it and any test importing the Worker fails to load.
 *
 * ⚠️ The proper fix is `@cloudflare/vitest-pool-workers`, which runs tests in
 * the real runtime. It was tried and backed out because it peers on vitest
 * ^4.1 while the monorepo was on 3.x. The monorepo is on 4.1 now, so that
 * blocker has gone; moving to it is a follow-up, not part of the upgrade.
 *
 * So the base class is stubbed, and the limiting *rule* lives in
 * src/rate-limit-policy.ts as a pure function that needs no runtime at all.
 * What remains untested here is the wiring between them — verified against the
 * deployed Worker instead, which is the only place the previous limiter's
 * failure was visible anyway.
 */
export default defineConfig({
  resolve: {
    alias: { "cloudflare:workers": new URL("./test/workers-stub.ts", import.meta.url).pathname },
  },
});

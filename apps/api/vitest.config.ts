import { defineConfig } from "vitest/config";

/**
 * `cloudflare:workers` is a runtime module that only exists inside `workerd`,
 * so Node cannot resolve it and any test importing the Worker fails to load.
 *
 * ⚠️ The proper fix is `@cloudflare/vitest-pool-workers`, which runs tests in
 * the real runtime. It was tried and backed out: the current version peers on
 * vitest ^4.1 while this monorepo is on 3.x, and upgrading vitest across three
 * packages to unit-test one class is not a trade worth making.
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

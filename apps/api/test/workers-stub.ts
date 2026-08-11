/**
 * Minimal stand-in for `cloudflare:workers` so Node can load modules that
 * extend `DurableObject`. Only the shape is needed — the behaviour under test
 * lives in src/rate-limit-policy.ts.
 */
export class DurableObject<Env = unknown> {
  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {}
}

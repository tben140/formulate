import { json } from "./http";
import { handleOrderCounted, type OrderCountedEnv } from "./order-backup";
import { handleOrderWebhook, type OrderWebhookEnv } from "./order-webhook";
import { handleSubscribe, type SubscribeEnv } from "./routes/subscribe";
import { reportError, type SentryEnv } from "./sentry";

/**
 * The Worker's entry point: the Durable Object classes Cloudflare binds, the
 * environment, and the route table. Nothing here knows what a route does.
 *
 * One Worker, one module per route, under routes/. A route is a function of
 * the request and the environment; what it needs is its own `…Env` interface,
 * and `Env` below is the intersection of them all, so a route can't read a
 * binding another route declared. Adding a route is a new file under routes/
 * and one line in the table.
 */

export { OrderBackup } from "./order-backup";
export { RateLimiter } from "./rate-limiter";

export type Env = SubscribeEnv & OrderWebhookEnv & OrderCountedEnv & SentryEnv;

/** What a route may use from Cloudflare's context: work after the response. */
export type Ctx = Pick<ExecutionContext, "waitUntil">;

type Route = (request: Request, env: Env, ctx: Ctx) => Promise<Response>;

/**
 * Routes by exact path.
 *
 * The newsletter sign-up is not in the table: the app posts to `/`, and a
 * build already on a phone keeps the address it was built with, so sign-up
 * stays the route every path not claimed below reaches, as it always has.
 * That is also why a route added here must claim a path nothing posts to
 * today.
 */
const routes: ReadonlyMap<string, Route> = new Map<string, Route>([
  // Shopify's order webhook (SHO-88): checked by its HMAC, not rate limited.
  ["/webhooks/orders-create", handleOrderWebhook],
  // The checkout pixel's "order counted" note (SHO-88). The one route with a
  // CORS header: see order-backup.ts and AGENTS.md.
  ["/orders/counted", handleOrderCounted],
]);

/**
 * Uncaught errors go to Sentry (EU region, project `worker`), as do the
 * routes' own reports. Errors only, no tracing, and no dependency: see
 * src/sentry.ts for exactly what is sent (never the request or the user).
 * The caller gets a bare 500, no error detail.
 */
export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      return await (routes.get(pathname) ?? handleSubscribe)(request, env, ctx);
    } catch (error) {
      reportError(env.SENTRY_DSN, ctx, {
        message: "Uncaught error",
        level: "error",
        error,
      });
      return json({ ok: false, reason: "rejected" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

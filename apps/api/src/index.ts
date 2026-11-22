import { handleOrderCounted, type OrderCountedEnv } from "./order-backup";
import { handleOrderWebhook, type OrderWebhookEnv } from "./order-webhook";
import { handleSubscribe, type SubscribeEnv } from "./routes/subscribe";

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

export type Env = SubscribeEnv & OrderWebhookEnv & OrderCountedEnv;

type Route = (request: Request, env: Env) => Promise<Response>;

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    return (routes.get(pathname) ?? handleSubscribe)(request, env);
  },
} satisfies ExportedHandler<Env>;

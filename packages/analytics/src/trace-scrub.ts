/**
 * Strips personal data from a Sentry transaction (a trace) before it leaves
 * the device or server.
 *
 * Error events are already scrubbed by each surface's `beforeSend`. Traces
 * carry the same kinds of data in different places: the root span's attributes
 * (`contexts.trace.data`), every child span's attributes and description, and
 * the transaction's request. This is the `beforeSendTransaction` for all of
 * them, so the rules live in one tested place.
 *
 * Structurally typed, so this package doesn't depend on a Sentry SDK. Each
 * surface passes its own SDK's event straight through.
 *
 * What goes:
 * - query strings and fragments, wherever a URL appears: search terms,
 *   sign-in codes and tokens travel there;
 * - every request and response header, including the IP headers Cloudflare
 *   and Vercel add;
 * - the user agent, client address and user;
 * - the request (its body is where an email address would be).
 *
 * What stays: span names, timings, status codes, methods, hosts and paths.
 * That's all a trace needs to show where time went.
 */

type SpanData = Record<string, unknown>;

interface SpanLike {
  description?: string;
  data?: SpanData;
}

export interface TransactionLike {
  transaction?: string;
  request?: unknown;
  user?: unknown;
  contexts?: { trace?: { data?: SpanData } };
  spans?: SpanLike[];
}

/** Drops the query string and fragment. */
export const stripQuery = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;

/** Attributes that hold a URL: kept, without the query. */
const URL_KEYS = new Set(["url", "url.full", "http.url", "http.target", "url.path"]);

/** Attributes dropped outright. */
const DROP_KEYS = new Set([
  "url.query",
  "url.fragment",
  "http.query",
  "http.fragment",
  "user_agent.original",
  "http.user_agent",
  "client.address",
  "http.client_ip",
  "net.peer.ip",
  "network.peer.address",
]);

const DROP_PREFIXES = ["http.request.header.", "http.response.header.", "user."];

const scrubData = (data: SpanData | undefined): void => {
  if (!data) return;
  for (const key of Object.keys(data)) {
    if (DROP_KEYS.has(key) || DROP_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete data[key];
      continue;
    }
    const value = data[key];
    if (URL_KEYS.has(key) && typeof value === "string") data[key] = stripQuery(value);
  }
};

/**
 * Span names often embed the URL ("GET https://host/path?q=…"), so the query
 * goes from those too.
 */
const scrubName = (name: string | undefined): string | undefined =>
  name?.replace(/\?[^\s]*|#[^\s]*/g, "");

export const scrubTransaction = <T extends TransactionLike>(event: T): T => {
  delete event.request;
  delete event.user;
  event.transaction = scrubName(event.transaction);
  scrubData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    span.description = scrubName(span.description);
    scrubData(span.data);
  }
  return event;
};

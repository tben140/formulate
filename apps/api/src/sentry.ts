/**
 * Errors to Sentry without Sentry's SDK (EU region, project `worker`).
 *
 * The Worker holds the Klaviyo key and has no dependencies, which is its
 * strongest supply-chain control (AGENTS.md). So instead of @sentry/cloudflare
 * it sends Sentry's envelope format itself, with `fetch`, from what it builds
 * here and nothing else:
 *
 * - a message, a level, an exception's type, message and stack frames, and
 *   the few `extra` values the caller passes (status codes);
 * - never the request: no headers (so no CF-Connecting-IP), cookies, body or
 *   query string, and no user;
 * - every string is cut to a few hundred characters and anything shaped like
 *   an email address is replaced, so even an error message that quoted input
 *   can't carry one.
 *
 * Sent with `ctx.waitUntil`, so it never delays the response, and a failure
 * to report is ignored. Off when SENTRY_DSN is unset (local runs, tests).
 * https://develop.sentry.dev/sdk/data-model/envelopes/
 */

export interface ErrorReport {
  readonly message: string;
  readonly level: "error" | "warning";
  readonly error?: unknown;
  readonly extra?: Readonly<Record<string, string | number | boolean>>;
}

interface Dsn {
  readonly endpoint: string;
  readonly key: string;
}

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

/** Short and free of email addresses. */
export const scrub = (text: string, max = 300): string =>
  text.replace(EMAIL, "[email]").slice(0, max);

/** "https://<key>@<host>/<project>" → the envelope endpoint and key. */
export const parseDsn = (dsn: string | undefined): Dsn | null => {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+/, "");
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(project)) return null;
    return {
      endpoint: `https://${url.host}/api/${project}/envelope/`,
      key: url.username,
    };
  } catch {
    return null;
  }
};

/** V8 stack lines as Sentry frames, oldest first, as Sentry expects. */
const frames = (stack: string | undefined) =>
  (stack ?? "")
    .split("\n")
    .slice(1, 30)
    .flatMap((line) => {
      const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
      if (!match) return [];
      const [, fn, file, lineno, colno] = match;
      return [
        {
          function: scrub(fn ?? "?", 100),
          filename: scrub(file ?? "?", 200),
          lineno: Number(lineno),
          colno: Number(colno),
        },
      ];
    })
    .reverse();

/** The envelope body for one event: header, item header, event. */
export const envelope = (
  report: ErrorReport,
  dsn: string,
  now: Date,
  eventId: string,
): string => {
  const error = report.error instanceof Error ? report.error : null;
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: report.level,
    environment: "production",
    logger: "worker",
    message: { formatted: scrub(report.message) },
    ...(error
      ? {
          exception: {
            values: [
              {
                type: scrub(error.name, 100),
                value: scrub(error.message),
                stacktrace: { frames: frames(error.stack) },
              },
            ],
          },
        }
      : {}),
    extra: Object.fromEntries(
      Object.entries(report.extra ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" ? scrub(value) : value,
      ]),
    ),
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
};

/** Reports in the background; does nothing without a DSN. */
export const reportError = (
  dsn: string | undefined,
  ctx: Pick<ExecutionContext, "waitUntil">,
  report: ErrorReport,
): void => {
  const target = parseDsn(dsn);
  if (!target || !dsn) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  ctx.waitUntil(
    fetch(target.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=formulate-worker/1.0`,
      },
      body: envelope(report, dsn, new Date(), eventId),
    }).then(
      () => undefined,
      () => undefined,
    ),
  );
};

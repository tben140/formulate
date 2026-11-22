/**
 * Security headers for every response (docs/security.md, "The running
 * sites"). Set here rather than in vercel.json so `next start`, the e2e
 * tests and Vercel all send the same ones.
 *
 * The Content Security Policy is **report-only** for now: browsers log what
 * it would block without blocking it. e2e/security-headers.spec.ts fails on
 * any violation on the main pages; once it has held through the batch's
 * analytics PRs (PostHog, Sentry, ad tags), it switches to
 * `Content-Security-Policy`.
 *
 * ⚠️ `script-src` allows `'unsafe-inline'`: Next's App Router inlines its
 * hydration data as scripts, and the alternative (a nonce per request) makes
 * every page dynamic, which would undo the cached catalogue. So this policy
 * limits *where* scripts load from, not inline injection. React's escaping
 * is the defence against that.
 */

/** Each directive's sources. A new third party adds its host here. */
const policy: Record<string, readonly string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    // Klaviyo's onsite script, after consent (components/tracking-consent.tsx).
    "https://static.klaviyo.com",
    "https://static-tracking.klaviyo.com",
  ],
  // Klaviyo's forms inject inline styles and their own stylesheets.
  "style-src": ["'self'", "'unsafe-inline'", "https://*.klaviyo.com"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://cdn.shopify.com",
    "https://*.klaviyo.com",
  ],
  "font-src": ["'self'", "data:", "https://*.klaviyo.com"],
  // Klaviyo's tracking and form submissions; PostHog's capture endpoint
  // (POSTHOG_HOST in @formulate/analytics), after consent.
  "connect-src": ["'self'", "https://*.klaviyo.com", "https://eu.i.posthog.com"],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  // Server Actions post to this site; without JavaScript, the cart's form
  // post redirects to Shopify's checkout, and form-action covers redirects.
  "form-action": ["'self'", "https://*.myshopify.com", "https://shop.app"],
  // Ignored in a report-only policy; X-Frame-Options below enforces it.
  "frame-ancestors": ["'none'"],
};

/**
 * Vercel's comment toolbar, on preview deployments only: Vercel injects its
 * script into preview pages even with `x-vercel-skip-toolbar`, so the e2e run
 * against a preview saw it. Hosts from Vercel's own CSP guidance. Production
 * never gets these.
 */
const vercelPreviewToolbar: Record<string, readonly string[]> = {
  "script-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "img-src": ["https://vercel.live", "https://vercel.com"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "frame-src": ["https://vercel.live"],
};

/**
 * Where browser errors go (lib/sentry-client.ts): the ingest host in the DSN,
 * exactly, rather than every Sentry host. Undefined when Sentry is off, or the
 * DSN doesn't parse.
 */
export const sentryOrigin = (dsn: string | undefined): string | undefined => {
  if (!dsn) return undefined;
  try {
    return new URL(dsn).origin;
  } catch {
    return undefined;
  }
};

/**
 * The policy for this build: `VERCEL_ENV` is "preview" on preview builds, and
 * the Sentry DSN, when set, adds its ingest host to connect-src.
 */
export const buildPolicy = (preview: boolean, sentryDsn?: string): string =>
  Object.entries(policy)
    .map(([directive, sources]) => {
      const sentry = directive === "connect-src" ? sentryOrigin(sentryDsn) : undefined;
      const extra = [
        ...(preview ? (vercelPreviewToolbar[directive] ?? []) : []),
        ...(sentry ? [sentry] : []),
      ];
      // A source list with 'none' can't take anything else.
      const all =
        extra.length > 0 ? [...sources.filter((s) => s !== "'none'"), ...extra] : sources;
      return `${directive} ${all.join(" ")}`;
    })
    .join("; ");

export const contentSecurityPolicy = buildPolicy(
  process.env.VERCEL_ENV === "preview",
  process.env.NEXT_PUBLIC_SENTRY_DSN,
);

export const securityHeaders: readonly { key: string; value: string }[] = [
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  // Nothing may frame the site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS only, for two years. No `preload` until the real domain is bought:
  // preloading is hard to undo.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Device features the shop never asks for.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()",
  },
  // Keeps other sites' windows from scripting ours; popups (Shop Pay) still work.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

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
  // Klaviyo's tracking and form submissions.
  "connect-src": ["'self'", "https://*.klaviyo.com"],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  // Server Actions post to this site; without JavaScript, the cart's form
  // post redirects to Shopify's checkout, and form-action covers redirects.
  "form-action": ["'self'", "https://*.myshopify.com", "https://shop.app"],
  // Ignored in a report-only policy; X-Frame-Options below enforces it.
  "frame-ancestors": ["'none'"],
};

export const contentSecurityPolicy = Object.entries(policy)
  .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
  .join("; ");

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

import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  /**
   * The workspace packages ship raw TypeScript rather than a build output, so
   * Next compiles them itself. This is what removes a `build` step (and a
   * turbo dependency edge) from every shared package.
   */
  transpilePackages: [
    "@formulate/analytics",
    "@formulate/experiments",
    "@formulate/shopify",
    "@formulate/tokens",
  ],

  /**
   * No `images` setting, on purpose. The site draws every image with
   * Hydrogen's <Image>, straight from Shopify's CDN, so Next's image optimiser
   * has nothing to fetch. Without `remotePatterns`, `/_next/image` refuses any
   * remote URL, which closes the endpoint behind GHSA-2464-fhr4-w9xw
   * (docs/security.md). Use Hydrogen's <Image>, not next/image.
   */

  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },

  /**
   * The storefront for AI agents (lib/agents.ts). Markdown versions of product
   * and collection pages, at `.md` URLs or by `Accept: text/markdown`; and
   * `/.well-known/ucp`, the store's Universal Commerce Protocol profile, served
   * by Shopify for the store and proxied so agents find it from this domain.
   */
  rewrites: async () => {
    const markdown = {
      type: "header" as const,
      key: "accept",
      value: ".*text/markdown.*",
    };
    return {
      beforeFiles: [
        { source: "/search.md", destination: "/agent-md/search" },
        {
          source: "/products/:handle([^/.]+).md",
          destination: "/agent-md/products/:handle",
        },
        {
          source: "/collections/:handle([^/.]+).md",
          destination: "/agent-md/collections/:handle",
        },
        {
          source: "/products/:handle",
          has: [markdown],
          destination: "/agent-md/products/:handle",
        },
        {
          source: "/collections/:handle",
          has: [markdown],
          destination: "/agent-md/collections/:handle",
        },
      ],
      afterFiles: process.env.SHOPIFY_STORE_DOMAIN
        ? [
            {
              source: "/.well-known/ucp",
              destination: `https://${process.env.SHOPIFY_STORE_DOMAIN}/.well-known/ucp`,
            },
          ]
        : [],
      fallback: [],
    };
  },
};

/**
 * Sentry's build step uploads source maps so stack traces show the original
 * TypeScript. It only runs when SENTRY_AUTH_TOKEN and SENTRY_ORG are set (in
 * Vercel, never here); without them the build skips the upload.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: "web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN || !process.env.SENTRY_ORG,
    deleteSourcemapsAfterUpload: true,
  },
  silent: !process.env.CI,
  telemetry: false,
  // Errors only, so leave tracing, replay and debug logging out of the bundle.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});

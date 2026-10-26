import type { NextConfig } from "next";

import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  /**
   * The workspace packages ship raw TypeScript rather than a build output, so
   * Next compiles them itself. This is what removes a `build` step (and a
   * turbo dependency edge) from every shared package.
   */
  transpilePackages: ["@formulate/analytics", "@formulate/shopify", "@formulate/tokens"],

  /**
   * Only Shopify's file paths, not the whole CDN host. The app draws images
   * with Hydrogen's <Image> (straight from Shopify's CDN), so `/_next/image`
   * mostly serves nothing; narrowing it shrinks what the optimiser will fetch
   * for anyone who calls it (GHSA-2464-fhr4-w9xw, docs/security.md). Predictive
   * search (#87) uses next/image, which is why this isn't removed outright.
   */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com", pathname: "/s/files/**" },
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default nextConfig;

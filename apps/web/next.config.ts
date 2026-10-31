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
   * No `images` setting, on purpose. The site draws every image with
   * Hydrogen's <Image>, straight from Shopify's CDN, so Next's image optimiser
   * has nothing to fetch. Without `remotePatterns`, `/_next/image` refuses any
   * remote URL, which closes the endpoint behind GHSA-2464-fhr4-w9xw
   * (docs/security.md). Use Hydrogen's <Image>, not next/image.
   */

  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default nextConfig;

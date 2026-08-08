import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The workspace packages ship raw TypeScript rather than a build output, so
   * Next compiles them itself. This is what removes a `build` step (and a
   * turbo dependency edge) from every shared package.
   */
  transpilePackages: ["@formulate/analytics", "@formulate/shopify", "@formulate/tokens"],

  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }],
  },
};

export default nextConfig;

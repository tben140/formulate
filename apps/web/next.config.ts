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

export default nextConfig;

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { addToCart } from "@/app/actions/cart";

import { useCartUi } from "./cart-provider";

/**
 * WebMCP: tools an AI agent in the shopper's own browser can call on this
 * page (Shopify Editions Fall '26). Search, read a product, add to the cart
 * and open it. Checkout itself is Shopify's, which registers its own WebMCP
 * tools and asks the shopper to confirm before an order is placed.
 *
 * WebMCP is a draft (W3C Community Group), behind a flag or origin trial in
 * Chrome; everywhere else this does nothing. `document.modelContext` is the
 * current entry point, `navigator.modelContext` the older one.
 */

interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}
interface ModelContext {
  registerTool: (tool: {
    name: string;
    description: string;
    inputSchema: object;
    execute: (input: Record<string, unknown>) => Promise<ToolResult>;
  }) => unknown;
  unregisterTool?: (name: string) => void;
}

const modelContext = (): ModelContext | null => {
  const holder = (document as { modelContext?: ModelContext }).modelContext
    ? document
    : navigator;
  const context = (holder as { modelContext?: ModelContext }).modelContext;
  return typeof context?.registerTool === "function" ? context : null;
};

const text = (value: string): ToolResult => ({
  content: [{ type: "text", text: value }],
});

const markdown = async (path: string): Promise<ToolResult> => {
  const response = await fetch(path, { headers: { accept: "text/markdown" } });
  return text(await response.text());
};

const NAMES = ["search_products", "get_product", "add_to_cart", "open_cart"] as const;

export const AgentTools = () => {
  const router = useRouter();
  const { openCart } = useCartUi();

  useEffect(() => {
    const context = modelContext();
    if (!context) return;

    context.registerTool({
      name: "search_products",
      description:
        "Search this store's products. Returns Markdown: each product with its price and a link to its details. A demo store: checkout is a test, no one is charged.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "What to search for" } },
        required: ["query"],
      },
      execute: (input) =>
        markdown(`/search.md?q=${encodeURIComponent(String(input.query ?? ""))}`),
    });
    context.registerTool({
      name: "get_product",
      description:
        "A product's description, options, prices, stock and subscription plans, as Markdown, with the variant and selling plan ids add_to_cart needs.",
      inputSchema: {
        type: "object",
        properties: {
          handle: { type: "string", description: "The product's handle, from its URL" },
        },
        required: ["handle"],
      },
      execute: (input) =>
        markdown(`/products/${encodeURIComponent(String(input.handle ?? ""))}.md`),
    });
    context.registerTool({
      name: "add_to_cart",
      description:
        "Add a product variant to the shopper's cart, once or on a subscription plan. Use ids from get_product. The shopper sees the cart open.",
      inputSchema: {
        type: "object",
        properties: {
          variantId: { type: "string", description: "gid://shopify/ProductVariant/…" },
          sellingPlanId: {
            type: "string",
            description:
              "gid://shopify/SellingPlan/… for a subscription; omit for one-time",
          },
          quantity: { type: "integer", minimum: 1, maximum: 6 },
        },
        required: ["variantId"],
      },
      execute: async (input) => {
        const form = new FormData();
        form.set("merchandiseId", String(input.variantId ?? ""));
        if (input.sellingPlanId) form.set("sellingPlanId", String(input.sellingPlanId));
        form.set("quantity", String(input.quantity ?? 1));
        const result = await addToCart({ status: "idle" }, form);
        if (result.status !== "success")
          return text(result.message ?? "Couldn't add that.");
        router.refresh();
        openCart();
        return text(
          `Added. The cart now has ${result.cart?.totalQuantity ?? "some"} item(s). The shopper checks out from the cart; checkout asks them to confirm.`,
        );
      },
    });
    context.registerTool({
      name: "open_cart",
      description:
        "Open the shopper's cart on this page, where they can review it and check out.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        openCart();
        return text("The cart is open.");
      },
    });

    return () => {
      for (const name of NAMES) context.unregisterTool?.(name);
    };
  }, [router, openCart]);

  return null;
};

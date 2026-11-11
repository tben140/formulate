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
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      execute: (input: Record<string, unknown>) => Promise<ToolResult>;
    },
    options?: { signal?: AbortSignal },
  ) => unknown;
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

/** The quantity cap every storefront enforces (SHO-132). */
const MAX_QUANTITY = 6;

export const AgentTools = () => {
  const router = useRouter();
  const { openCart } = useCartUi();

  useEffect(() => {
    const context = modelContext();
    if (!context) return;

    // WebMCP removes a tool when its registration's signal aborts; there is no
    // unregisterTool. One controller for all four, aborted on cleanup, so a
    // re-run of this effect never registers a duplicate name.
    const controller = new AbortController();
    const register = (tool: Parameters<ModelContext["registerTool"]>[0]) => {
      try {
        // Newer Chrome returns a promise; a rejection must not go unhandled.
        void Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => undefined);
      } catch {
        // An older implementation that throws synchronously: skip the tool.
      }
    };

    register({
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
    register({
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
    register({
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
          quantity: { type: "integer", minimum: 1, maximum: MAX_QUANTITY },
        },
        required: ["variantId"],
      },
      execute: async (input) => {
        // The schema states the range, but nothing makes a caller honour it.
        const quantity = input.quantity === undefined ? 1 : Number(input.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
          return text(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
        }
        const form = new FormData();
        form.set("merchandiseId", String(input.variantId ?? ""));
        if (input.sellingPlanId) form.set("sellingPlanId", String(input.sellingPlanId));
        form.set("quantity", String(quantity));
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
    register({
      name: "open_cart",
      description:
        "Open the shopper's cart on this page, where they can review it and check out.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        openCart();
        return text("The cart is open.");
      },
    });

    return () => controller.abort();
  }, [router, openCart]);

  return null;
};

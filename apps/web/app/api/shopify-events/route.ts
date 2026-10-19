import { revalidateTag } from "next/cache";

import { isFromShopify, tagsForDelivery, type EventData } from "@/lib/shopify-events";

/**
 * Receives Shopify Events (SHO-171) and clears the cache tags a change
 * touches, so a price or stock change shows on the next visit instead of
 * after the hourly backstop. Subscriptions: apps/shopify-app/shopify.app.toml.
 *
 * ⚠️ Verified before anything is read: the body must be signed with the
 * Double Helix app's client secret (SHOPIFY_APP_CLIENT_SECRET, server-only,
 * Sensitive in Vercel). No Admin token is involved. Handling a delivery twice
 * is harmless, so retries aren't de-duplicated.
 */
export const POST = async (request: Request): Promise<Response> => {
  const secret = process.env.SHOPIFY_APP_CLIENT_SECRET ?? "";
  if (!secret) return new Response("Not configured", { status: 503 });

  const rawBody = await request.text();
  if (!isFromShopify(rawBody, request.headers.get("shopify-hmac-sha256"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { topic?: string; action?: string; data?: EventData };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const topic = payload.topic ?? request.headers.get("shopify-topic") ?? "";
  const action = payload.action ?? request.headers.get("shopify-action") ?? "";
  const tags = tagsForDelivery(topic, action, payload.data);
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  console.info(
    `[shopify-events] ${topic}/${action} ${request.headers.get("shopify-webhook-id") ?? ""}: ${tags.join(", ") || "nothing to clear"}`,
  );
  return Response.json({ cleared: tags });
};

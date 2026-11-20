import { legacyIdFromGid } from "./events";
import { KLAVIYO_REVISION, isPlausibleEmail, type SubscribeResult } from "./subscribe";

/**
 * Back-in-stock alerts (SHO-118): "email me when this variant is back".
 *
 * Recorded against a **variant in Klaviyo's catalogue**, which Klaviyo's
 * Shopify integration keeps in sync. When Shopify restocks the variant, Klaviyo
 * fires "Subscribed to Back in Stock"-driven sends from the live "Back in stock"
 * flow (`RJ6Jua`). Verified 2026-10-03: earlier subscriptions to Magnesium
 * Glycinate 200 mg arrived with `platform: Shopify` and the product's
 * collections attached, so the variant is matched, not just accepted.
 *
 * ⚠️ A restock alert is **not** a marketing subscription, and nothing here
 * subscribes anyone to anything else. Klaviyo emails once, about this variant.
 * The surfaces word it that way too: the same distinction `subscribe` and
 * `identify` draw for the newsletter.
 *
 * Same result type as the newsletter, so the surfaces reuse their error copy.
 */

/**
 * The client endpoint. Takes the public key as `company_id`, like
 * `/client/subscriptions/`, so web and theme call it from the browser.
 * Unreachable from a native app (Cloudflare blocks it), so mobile will need the
 * worker, as consent does (ADR 0007).
 */
export const backInStockUrl = (publicKey: string): string =>
  `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${encodeURIComponent(publicKey)}`;

/**
 * Klaviyo's id for a Shopify variant in its catalogue:
 * `$shopify:::$default:::<numeric variant id>`.
 *
 * Accepts the Storefront API's gid or the bare number Liquid gives. Returns
 * null for anything else rather than sending an id that matches nothing:
 * Klaviyo would accept it with a 202 and no alert would ever fire.
 */
export const catalogVariantId = (variant: string | number): string | null => {
  const numeric =
    typeof variant === "number"
      ? Number.isSafeInteger(variant) && variant > 0
        ? variant
        : 0
      : /^\d+$/.test(variant)
        ? Number(variant)
        : legacyIdFromGid(variant);
  return numeric > 0 ? `$shopify:::$default:::${numeric}` : null;
};

/**
 * The server-side endpoint, for the app's Worker (apps/api). Same payload as
 * the client one, authenticated with a private key that has catalogs:write
 * and profiles:write.
 */
export const SERVER_BACK_IN_STOCK_URL =
  "https://a.klaviyo.com/api/back-in-stock-subscriptions";

/** The JSON:API document: email only, one channel, one variant. */
export const backInStockPayload = ({
  email,
  variantId,
}: {
  readonly email: string;
  readonly variantId: string;
}) => ({
  data: {
    type: "back-in-stock-subscription",
    attributes: {
      channels: ["EMAIL"],
      profile: {
        data: { type: "profile", attributes: { email: email.trim() } },
      },
    },
    relationships: {
      variant: { data: { type: "catalog-variant", id: variantId } },
    },
  },
});

/**
 * Asks Klaviyo to email `email` when `variant` is back in stock.
 *
 * Like the newsletter endpoint, `202` means queued: Klaviyo can't say whether
 * this address was already waiting on this variant, so the surfaces say
 * "We'll email you", which is true either way.
 */
export const submitBackInStock = async ({
  publicKey,
  email,
  variant,
}: {
  readonly publicKey: string;
  readonly email: string;
  /** The variant's Storefront gid, or its numeric id. */
  readonly variant: string | number;
}): Promise<SubscribeResult> => {
  if (email.trim() === "") return { ok: false, reason: "empty" };
  if (!isPlausibleEmail(email)) return { ok: false, reason: "invalid-email" };
  const variantId = catalogVariantId(variant);
  if (!publicKey || !variantId) return { ok: false, reason: "not-configured" };

  try {
    const response = await fetch(backInStockUrl(publicKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(backInStockPayload({ email, variantId })),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: "rejected", status: response.status, detail };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
};

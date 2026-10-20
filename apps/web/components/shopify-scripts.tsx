"use client";

import { AnalyticsEvent } from "@shopify/hydrogen";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { readConsent, type TrackingConsent } from "@/lib/consent";

/**
 * Shopify's scripts and analytics bus, told our banner's answer (ADR 0011,
 * stage 1).
 *
 * `custom-banner` mode: our banner (ADR 0008) stays the one the shopper sees
 * and the source of truth; Shopify's Customer Privacy API is only told the
 * result. Hydrogen buffers analytics events until `setup` resolves, so nothing
 * is delivered before the shopper chooses.
 *
 * One opt-in maps to all four of Shopify's purposes, as ADR 0011 says to do
 * while ADR 0010's two tiers are only proposed.
 */
export const CONSENT_EVENT = "dh:tracking-consent";

type Choice = Exclude<TrackingConsent, "unset">;

const toPreferences = (choice: Choice) => {
  const allowed = choice === "granted";
  return {
    analytics: allowed,
    marketing: allowed,
    preferences: allowed,
    sale_of_data: allowed,
  };
};

const nextChoice = () =>
  new Promise<Choice>((resolve) => {
    window.addEventListener(
      CONSENT_EVENT,
      (event) => resolve((event as CustomEvent<Choice>).detail),
      { once: true },
    );
  });

export const HydrogenScripts = ({
  shopId,
  myshopifyDomain,
}: {
  readonly shopId: string;
  readonly myshopifyDomain: string;
}) => (
  <ShopifyScripts
    shop={{ shopId, storefrontId: "0", myshopifyDomain }}
    i18n={{ country: "GB", language: "EN", currency: "GBP" }}
    analytics={{ channel: "headless" }}
    // Shopify's WebMCP tools for AI agents load by default. Off until Ben
    // decides whether agent tooling belongs on the storefront (SHO-170).
    webMcp={false}
    consent={{
      mode: "custom-banner",
      async setup() {
        const privacy = window.Shopify?.customerPrivacy;
        if (!privacy) {
          // Shopify's consent script didn't load (blocked, offline). Events
          // then stay buffered: nothing is sent without a choice.
          throw new Error("Shopify Customer Privacy API is unavailable");
        }
        const sync = (choice: Choice) =>
          privacy.setTrackingConsent(toPreferences(choice));

        const saved = readConsent();
        await sync(saved === "unset" ? await nextChoice() : saved);

        // Later changes from the footer's "Cookie preferences". Registered
        // after the first choice, so that choice isn't synced twice.
        window.addEventListener(CONSENT_EVENT, (event) => {
          void Promise.resolve(sync((event as CustomEvent<Choice>).detail)).catch(
            console.error,
          );
        });
      },
    }}
  />
);

/** Page views on first load and on every client navigation. */
export const ShopifyPageViews = () => {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";

  useEffect(() => {
    window.Shopify?.analytics?.publish(AnalyticsEvent.PAGE_VIEWED);
  }, [pathname, search]);

  return null;
};

/**
 * A product view for Shopify's analytics, once per product. Built from the
 * product page's server data, so nothing extra is fetched in the browser.
 */
export const ShopifyProductViewed = ({
  product,
}: {
  readonly product: {
    readonly id: string;
    readonly title: string;
    readonly vendor: string;
    readonly price: { readonly amount: string; readonly currencyCode: string };
    readonly variantId: string;
    readonly variantTitle: string;
  };
}) => {
  useEffect(() => {
    window.Shopify?.analytics?.publish(AnalyticsEvent.PRODUCT_VIEWED, {
      products: [
        {
          ...product,
          // Our codegen and Hydrogen each declare Shopify's currency codes as
          // their own type; the values are the same strings.
          price: {
            amount: product.price.amount,
            currencyCode: product.price.currencyCode as never,
          },
          quantity: 1,
        },
      ],
    });
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per product

  return null;
};

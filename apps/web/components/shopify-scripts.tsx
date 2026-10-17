"use client";

import { AnalyticsEvent } from "@shopify/hydrogen";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { readConsent, type TrackingConsent } from "@/lib/consent";

/**
 * SHO-170 spike: Shopify's scripts and analytics bus, told our banner's answer.
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
    consent={{
      mode: "custom-banner",
      async setup() {
        const privacy = window.Shopify!.customerPrivacy!;
        const sync = (choice: Choice) =>
          privacy.setTrackingConsent(toPreferences(choice));

        // Later changes from the footer's "Cookie preferences".
        window.addEventListener(CONSENT_EVENT, (event) => {
          void Promise.resolve(sync((event as CustomEvent<Choice>).detail)).catch(
            console.error,
          );
        });

        const saved = readConsent();
        await sync(saved === "unset" ? await nextChoice() : saved);
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

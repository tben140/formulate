/**
 * Ambient declarations for globals the theme's JavaScript touches but does not
 * own.
 *
 * Lives outside `assets/` on purpose. The Shopify CLI only syncs the known
 * theme directories, so a `types/` folder at the theme root is typechecked
 * locally and never uploaded — whereas a `.d.ts` in `assets/` would be pushed
 * to the store as a theme asset.
 */

declare global {
  interface Window {
    /**
     * Klaviyo's event queue, installed by the app embed's `klaviyo.js`.
     *
     * ⚠️ This — never `window.klaviyo`. The latter is a real object exposing
     * `push`, so calling it throws no error and does nothing at all. Assigning
     * an array to it is worse: it shadows the object the script wants to
     * install, and every event lands somewhere nothing drains.
     *
     * Typed as an array union because it genuinely is one until `klaviyo.js`
     * loads and replaces it with something that consumes each `push`
     * immediately. That is what makes the queue-style API work at all.
     *
     * See docs/integration-klaviyo.md.
     */
    _learnq?: { push: (args: unknown[]) => void } | unknown[];

    /**
     * Shopify's storefront object, from `content_for_header`. Only the parts
     * the cookie banner uses: `loadFeatures` fetches the Customer Privacy API
     * and installs it as `customerPrivacy`.
     */
    Shopify?: {
      loadFeatures?: (
        features: { name: string; version: string }[],
        callback: (error?: unknown) => void,
      ) => void;
      customerPrivacy?: CustomerPrivacy;
    };
  }

  /** Shopify's Customer Privacy API (`consent-tracking-api` 0.1). */
  interface CustomerPrivacy {
    /** True when the visitor's region needs a choice and none is recorded. */
    shouldShowBanner: () => boolean;
    /** ISO 3166-2 region, such as "GBENG"; empty when unknown. */
    getRegion?: () => string;
    /** "yes", "no" or "" for each purpose. */
    currentVisitorConsent?: () => Record<string, string>;
    setTrackingConsent: (
      consent: {
        analytics: boolean;
        marketing: boolean;
        preferences: boolean;
        sale_of_data: boolean;
      },
      callback: (result?: { error?: string }) => void,
    ) => void;
  }
}

export {};

/**
 * What the campaigns CLI reads from Shopify and Klaviyo, as plain data. The
 * commands' logic (check, calendar, report, sync's config) works on these,
 * so it's tested without a store; `shopify-data.ts` and `klaviyo.ts` fill them.
 */

/** A `campaign` metaobject as the Admin API returns it. */
export interface CampaignEntry {
  readonly id: string;
  readonly handle: string;
  /** Published (active), rather than a draft. */
  readonly published: boolean;
  /** Field values by key; references are GIDs. */
  readonly fields: Readonly<Record<string, string | null>>;
  /** The image's alt text, when it has an image. */
  readonly imageAlt?: string | null;
}

export interface CollectionInfo {
  readonly id: string;
  readonly handle: string;
  /** Shown to shoppers, and what Klaviyo's Shopify events list in `Collections`. */
  readonly title?: string;
  /** A smart collection whose one rule is "campaign equals this entry". */
  readonly ruleMatchesCampaign: boolean;
  readonly productsCount: number;
}

export interface ProductInfo {
  readonly id: string;
  readonly title: string;
  /** ACTIVE, DRAFT or ARCHIVED. */
  readonly status: string;
  readonly onOnlineStore: boolean;
  /** The product's own `double_helix.campaign` (a metaobject GID). */
  readonly campaignId: string | null;
  readonly variants: readonly {
    readonly id: string;
    /** "Default Title" for a product without options. */
    readonly title?: string;
    readonly price: string;
    readonly campaignId: string | null;
    /** Shopify's unit cost, when one is set (needs read_inventory). */
    readonly cost?: string | null;
    /** Recorded price changes, oldest first (price-history.ts). */
    readonly priceHistory?: readonly (readonly [string, string])[];
  }[];
}

export interface DiscountInfo {
  readonly id: string;
  readonly title: string;
  /** `basic`: Shopify's own percentage discount; `app`: the campaign Function. */
  readonly kind: "basic" | "app" | "other";
  readonly method: "automatic" | "code";
  /** ACTIVE, SCHEDULED, EXPIRED. */
  readonly status: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  /** Basic discounts: the percentage, 1 to 100. */
  readonly percent: number | null;
  readonly appliesOnOneTimePurchase: boolean | null;
  readonly appliesOnSubscription: boolean | null;
  readonly collectionIds: readonly string[];
  /** App discounts: the Function's config metafield. */
  readonly config: unknown;
  readonly codes: readonly string[];
}

export interface EmailInfo {
  readonly id: string;
  readonly name: string;
  /** Klaviyo's status, e.g. "Draft", "Scheduled", "Sent". */
  readonly status: string;
  readonly sendAt: string | null;
  /** Subject and preview text, for the wording checks. */
  readonly text: string;
}

/** Everything `campaigns check` looks at for one campaign. */
export interface Snapshot {
  readonly entry: CampaignEntry;
  readonly collection: CollectionInfo | null;
  readonly products: readonly ProductInfo[];
  readonly discounts: readonly DiscountInfo[];
  /** Null when there's no Klaviyo key: the email checks are skipped. */
  readonly emails: readonly EmailInfo[] | null;
}

export type Level = "error" | "warning" | "ok";

export interface Finding {
  readonly level: Level;
  readonly message: string;
}

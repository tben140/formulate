/**
 * Campaigns (SHO-169): a time-boxed promotion defined once in Shopify, as a
 * `campaign` metaobject, and read by all three surfaces. See docs/campaigns.md.
 *
 * Metaobjects don't switch themselves off, so this module is where the dates
 * are enforced: every surface asks `isCampaignActive` and the three can't
 * disagree. Shopify enforces the discount itself at checkout; what's here only
 * decides what shoppers are told.
 */

/** A metaobject field as the Storefront API returns it (`field(key:)`). */
interface FieldValue {
  readonly value?: string | null;
}

/** The campaign's fields as CampaignFields (queries.ts) selects them. */
export interface CampaignNode {
  readonly handle: string;
  readonly title?: FieldValue | null;
  readonly startsAt?: FieldValue | null;
  readonly endsAt?: FieldValue | null;
  readonly badge?: FieldValue | null;
  readonly headline?: FieldValue | null;
  readonly bannerText?: FieldValue | null;
  readonly offer?: FieldValue | null;
  readonly discountCode?: FieldValue | null;
  readonly subscriberPerk?: FieldValue | null;
  readonly body?: FieldValue | null;
  readonly terms?: FieldValue | null;
  readonly image?: {
    readonly reference?: {
      readonly image?: CampaignImage | null;
    } | null;
  } | null;
  readonly collection?: {
    readonly reference?: { readonly handle?: string } | null;
  } | null;
}

export interface CampaignImage {
  readonly url: string;
  readonly altText?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
}

export interface Campaign {
  readonly handle: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly badge: string;
  readonly headline: string;
  readonly bannerText: string;
  readonly offer: string;
  readonly discountCode: string | null;
  readonly subscriberPerk: string | null;
  /** Rich text as Shopify stores it (JSON); see `campaignParagraphs`. */
  readonly body: string | null;
  readonly terms: string;
  readonly image: CampaignImage | null;
  readonly collectionHandle: string | null;
}

const text = (field: FieldValue | null | undefined): string | null => {
  const value = field?.value?.trim();
  return value ? value : null;
};

const date = (field: FieldValue | null | undefined): Date | null => {
  const value = text(field);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * A campaign from its metaobject, or null when it can't be shown honestly:
 * no dates, dates the wrong way round, or no offer or terms to state.
 */
export const toCampaign = (node: CampaignNode | null | undefined): Campaign | null => {
  if (!node) return null;
  const startsAt = date(node.startsAt);
  const endsAt = date(node.endsAt);
  const title = text(node.title);
  const badge = text(node.badge);
  const offer = text(node.offer);
  const terms = text(node.terms);
  if (!startsAt || !endsAt || endsAt <= startsAt) return null;
  if (!title || !badge || !offer || !terms) return null;
  return {
    handle: node.handle,
    title,
    startsAt,
    endsAt,
    badge,
    headline: text(node.headline) ?? title,
    bannerText: text(node.bannerText) ?? offer,
    offer,
    discountCode: text(node.discountCode),
    subscriberPerk: text(node.subscriberPerk),
    body: text(node.body),
    terms,
    image: node.image?.reference?.image ?? null,
    collectionHandle: node.collection?.reference?.handle ?? null,
  };
};

/** Live from `startsAt` up to, not including, `endsAt`. */
export const isCampaignActive = (campaign: Campaign, now: Date): boolean =>
  campaign.startsAt <= now && now < campaign.endsAt;

/**
 * The campaign to show site-wide: the active one ending soonest, so the most
 * urgent offer leads when two overlap.
 */
export const activeCampaign = (
  nodes: readonly (CampaignNode | null | undefined)[],
  now: Date,
): Campaign | null =>
  nodes
    .map(toCampaign)
    .filter((campaign): campaign is Campaign => campaign !== null)
    .filter((campaign) => isCampaignActive(campaign, now))
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())[0] ?? null;

/** A product's or variant's `double_helix.campaign` field. */
export interface CampaignRef {
  readonly reference?: CampaignNode | { readonly handle?: string } | null;
}

/**
 * The campaign for one variant, if it's live.
 *
 * The product's field puts the product in the campaign. If any of its variants
 * also has the field, the campaign covers only those variants, e.g. only the
 * 90-day size. `variantCampaigns` are the handles each variant points to.
 */
export const campaignForVariant = (
  productCampaign: CampaignRef | null | undefined,
  variant: { readonly campaign?: CampaignRef | null } | null | undefined,
  variantCampaigns: readonly (CampaignRef | null | undefined)[],
  now: Date,
): Campaign | null => {
  const campaign = toCampaign(productCampaign?.reference as CampaignNode | null);
  if (!campaign || !isCampaignActive(campaign, now)) return null;
  const narrowed = variantCampaigns.some((ref) => ref?.reference?.handle);
  if (narrowed && variant?.campaign?.reference?.handle !== campaign.handle) return null;
  return campaign;
};

/**
 * The badge for a product card: the product's campaign, if it's live. Cards
 * don't narrow by variant; the product page does.
 */
export const campaignBadge = (
  productCampaign: CampaignRef | null | undefined,
  now: Date,
): string | null => {
  const campaign = toCampaign(productCampaign?.reference as CampaignNode | null);
  return campaign && isCampaignActive(campaign, now) ? campaign.badge : null;
};

/** The same path on the theme (Shopify's metaobject pages) and on web. */
export const campaignPath = (handle: string): string => `/pages/campaigns/${handle}`;

/**
 * "Now", for deciding what's live. A preview time lets a campaign be checked
 * before it starts; each surface passes one only outside production.
 */
export const campaignNow = (previewAt?: string | null): Date => {
  if (previewAt) {
    const preview = new Date(previewAt);
    if (!Number.isNaN(preview.getTime())) return preview;
  }
  return new Date();
};

/** "23:59 Mon 30 Nov", in UK time. */
const ukTime = (at: Date): string => {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const part = (type: string) => formatted.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("weekday")} ${part("day")} ${part("month")}`;
};

/** "Ends 23:59 Mon 30 Nov": the real end time, in UK time. */
export const campaignEndsLabel = (campaign: Campaign): string =>
  // The last minute the offer runs, so midnight reads as the day before.
  `Ends ${ukTime(new Date(campaign.endsAt.getTime() - 60_000))}`;

/** "Starts 00:00 Fri 27 Nov". */
export const campaignStartsLabel = (campaign: Campaign): string =>
  `Starts ${ukTime(campaign.startsAt)}`;

/** Where a campaign is relative to now, for its landing page. */
export const campaignStatus = (
  campaign: Campaign,
  now: Date,
): "upcoming" | "active" | "ended" =>
  now < campaign.startsAt ? "upcoming" : now < campaign.endsAt ? "active" : "ended";

interface RichTextNode {
  readonly type?: string;
  readonly value?: string;
  readonly children?: readonly RichTextNode[];
}

const plain = (node: RichTextNode): string =>
  node.value ?? (node.children ?? []).map(plain).join("");

/**
 * The landing page body as plain paragraphs. Shopify's rich text is JSON;
 * headings and lists come out as paragraphs, which is all a campaign needs
 * and keeps the three surfaces rendering the same thing.
 */
export const campaignParagraphs = (body: string | null): string[] => {
  if (!body) return [];
  try {
    const root = JSON.parse(body) as RichTextNode;
    return (root.children ?? [])
      .map(plain)
      .map((p) => p.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

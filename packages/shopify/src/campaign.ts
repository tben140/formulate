/**
 * Campaigns (SHO-169): a time-boxed promotion defined once in Shopify, as a
 * `campaign` metaobject, and read by all three surfaces. See docs/campaigns.md.
 *
 * Metaobjects don't switch themselves off, so this module is where the dates
 * are enforced: every surface asks `isCampaignActive` and the three can't
 * disagree. Shopify enforces the discount itself at checkout; what's here only
 * decides what shoppers are told.
 */

import { campaignUnitPrice, parseOfferRules, type OfferRules } from "./campaign-offer";
import type { MoneyLike } from "./format-money";

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
  readonly audience?: FieldValue | null;
  /** Higher wins the banner when campaigns overlap; absent is 0. */
  readonly priority?: FieldValue | null;
  readonly offerRules?: FieldValue | null;
  readonly earlyAccessStartsAt?: FieldValue | null;
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
  /** `email_link`: only for people who arrived through an email link. */
  readonly audience: "everyone" | "email_link";
  /** Which one shows site-wide when two run at once: higher first. */
  readonly priority: number;
  /** The offer as data, when set and valid: see campaign-offer.ts. */
  readonly rules: OfferRules | null;
  /**
   * An earlier start for people who came through the campaign's email link
   * (`access`), or null. Only kept when it's before `startsAt`.
   */
  readonly earlyAccessStartsAt: Date | null;
}

/**
 * Who's looking, and when. Surfaces build one per request (web) or render
 * (app) and pass it to everything below.
 *
 * - `preview`: a campaign handle being previewed through a preview link. It's
 *   shown as if live, whatever its dates or audience.
 * - `access`: campaigns this visitor reached through an email link.
 */
export interface CampaignView {
  readonly now: Date;
  readonly preview?: string | null;
  readonly access?: ReadonlySet<string>;
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
    audience: text(node.audience) === "email_link" ? "email_link" : "everyone",
    priority: Number.parseInt(text(node.priority) ?? "", 10) || 0,
    rules: parseOfferRules(text(node.offerRules)),
    earlyAccessStartsAt: (() => {
      const early = date(node.earlyAccessStartsAt);
      return early && early < startsAt ? early : null;
    })(),
  };
};

/** Live from `startsAt` up to, not including, `endsAt`. */
export const isCampaignActive = (campaign: Campaign, now: Date): boolean =>
  campaign.startsAt <= now && now < campaign.endsAt;

/** Whether this visitor may see the campaign at all, dates aside. */
export const canSeeCampaign = (campaign: Campaign, view: CampaignView): boolean =>
  view.preview === campaign.handle ||
  campaign.audience === "everyone" ||
  (view.access?.has(campaign.handle) ?? false);

/**
 * When the campaign starts for this visitor: its early-access start if they
 * came through its email link, else its start.
 */
export const campaignStartFor = (campaign: Campaign, view: CampaignView): Date =>
  campaign.earlyAccessStartsAt && view.access?.has(campaign.handle)
    ? campaign.earlyAccessStartsAt
    : campaign.startsAt;

/** Shown as live to this visitor: previewed, or live and visible to them. */
export const isCampaignLive = (campaign: Campaign, view: CampaignView): boolean =>
  view.preview === campaign.handle ||
  (canSeeCampaign(campaign, view) &&
    campaignStartFor(campaign, view) <= view.now &&
    view.now < campaign.endsAt);

/**
 * The campaign to show site-wide: a previewed one first, then the live one
 * ending soonest, so the most urgent offer leads when two overlap.
 */
export const activeCampaign = (
  nodes: readonly (CampaignNode | null | undefined)[],
  view: CampaignView,
): Campaign | null => {
  const live = nodes
    .map(toCampaign)
    .filter((campaign): campaign is Campaign => campaign !== null)
    .filter((campaign) => isCampaignLive(campaign, view));
  return (
    live.find((campaign) => campaign.handle === view.preview) ??
    // Highest priority, then the one ending soonest (docs/campaigns.md, Overlaps).
    live.sort(
      (a, b) => b.priority - a.priority || a.endsAt.getTime() - b.endsAt.getTime(),
    )[0] ??
    null
  );
};

/** A product's or variant's `double_helix.campaign` field. */
export interface CampaignRef {
  readonly reference?: CampaignNode | { readonly handle?: string } | null;
}

/**
 * The campaign for one variant, if it's live for this visitor.
 *
 * The product's field puts the product in the campaign. If any of its variants
 * also has the field, the campaign covers only those variants, e.g. only the
 * 90-day size. `variantCampaigns` are the handles each variant points to.
 */
export const campaignForVariant = (
  productCampaign: CampaignRef | null | undefined,
  variant: { readonly campaign?: CampaignRef | null } | null | undefined,
  variantCampaigns: readonly (CampaignRef | null | undefined)[],
  view: CampaignView,
): Campaign | null => {
  const campaign = toCampaign(productCampaign?.reference as CampaignNode | null);
  if (!campaign || !isCampaignLive(campaign, view)) return null;
  const narrowed = variantCampaigns.some((ref) => ref?.reference?.handle);
  if (narrowed && variant?.campaign?.reference?.handle !== campaign.handle) return null;
  return campaign;
};

/**
 * The badge for a product card: the product's campaign, if it's live for this
 * visitor. Cards don't narrow by variant; the product page does.
 */
export const campaignBadge = (
  productCampaign: CampaignRef | null | undefined,
  view: CampaignView,
): string | null => {
  const campaign = toCampaign(productCampaign?.reference as CampaignNode | null);
  return campaign && isCampaignLive(campaign, view) ? campaign.badge : null;
};

/**
 * A product card's campaign price: the cheapest variant the live campaign
 * covers, with its normal price, when the offer has a single price. Null
 * otherwise, and the card shows its normal price and the badge.
 *
 * Variants rather than the product's price range, because a campaign that
 * covers only some variants mustn't put its price on the others.
 */
export const campaignCardPrice = (
  productCampaign: CampaignRef | null | undefined,
  variants: readonly {
    readonly price: MoneyLike;
    readonly campaign?: CampaignRef | null;
  }[],
  view: CampaignView,
): {
  readonly normal: MoneyLike;
  readonly offer: MoneyLike;
  readonly badge: string;
} | null => {
  const refs = variants.map((variant) => variant.campaign);
  const covered = variants
    .filter((variant) => campaignForVariant(productCampaign, variant, refs, view))
    .sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
  const cheapest = covered[0];
  if (!cheapest) return null;
  const campaign = campaignForVariant(productCampaign, cheapest, refs, view);
  const offer = campaign ? campaignUnitPrice(campaign.rules, cheapest.price) : null;
  return campaign && offer
    ? { normal: cheapest.price, offer, badge: campaign.badge }
    : null;
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
export const campaignStartsLabel = (
  campaign: Campaign,
  at: Date = campaign.startsAt,
): string => `Starts ${ukTime(at)}`;

/**
 * Where a campaign is for this visitor, for its landing page. `restricted`:
 * an email-link campaign reached without the link.
 */
export const campaignStatus = (
  campaign: Campaign,
  view: CampaignView,
): "upcoming" | "active" | "ended" | "restricted" => {
  if (view.preview === campaign.handle) return "active";
  if (!canSeeCampaign(campaign, view)) return "restricted";
  return view.now < campaignStartFor(campaign, view)
    ? "upcoming"
    : view.now < campaign.endsAt
      ? "active"
      : "ended";
};

/**
 * Where an email link may send someone after applying its code: a path on
 * this site only, never another origin (`//evil.example`, `/\evil.example`).
 */
export const safeRedirectPath = (redirect: string | null | undefined): string =>
  redirect && /^\/(?![/\\])[^\s]*$/.test(redirect) ? redirect : "/";

/** The campaign a path is the landing page of, if any. */
export const campaignHandleFromPath = (path: string): string | null =>
  /^\/pages\/campaigns\/([a-z0-9-]+)\/?(?:[?#].*)?$/.exec(path)?.[1] ?? null;

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

/**
 * Products in the live campaign first, the rest after, each group in its own
 * order (SHO-169 merchandising). A stable partition, so the merchant's sort
 * still decides within each; with no campaign the list is unchanged. Used on
 * collection pages and the home page's featured row, on web and the app; the
 * theme's product grid does the same in Liquid.
 */
export const campaignFirst = <
  T extends {
    readonly campaign?: {
      readonly reference?: { readonly handle?: string } | null;
    } | null;
  },
>(
  products: readonly T[],
  handle: string | null | undefined,
): T[] => {
  if (!handle) return [...products];
  const inCampaign = (product: T) => product.campaign?.reference?.handle === handle;
  return [...products.filter(inCampaign), ...products.filter((p) => !inCampaign(p))];
};

/**
 * Products that can be bought first, sold-out ones after, each group in its
 * own order: a campaign's page shouldn't lead with something nobody can
 * have. A product without the field counts as available.
 */
export const availableFirst = <T extends { readonly availableForSale?: boolean }>(
  products: readonly T[],
): T[] => [
  ...products.filter((product) => product.availableForSale !== false),
  ...products.filter((product) => product.availableForSale === false),
];

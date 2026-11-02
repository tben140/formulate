import {
  isCampaignLive,
  toCampaign,
  type CampaignImage,
  type CampaignNode,
  type CampaignView,
} from "./campaign";

/**
 * Campaign imagery on products (SHO-204). A product's `double_helix.campaign_media`
 * lists `campaign_media` entries, each a campaign and its images. While one of
 * those campaigns is live for this visitor (previews included), the product's
 * gallery leads with its images, and its card shows the first. When the
 * campaign ends the product's own images come back by themselves: Shopify's
 * product media are never touched.
 *
 * Web and the app call these; the theme restates them in
 * snippets/campaign-media.liquid.
 */

/** One `campaign_media` entry, as ProductCampaignMediaFields selects it. */
export interface CampaignMediaNode {
  readonly campaign?: { readonly reference?: unknown } | null;
  readonly images?: {
    readonly references?: {
      readonly nodes?:
        readonly ({ readonly image?: CampaignImage | null } | null)[] | null;
    } | null;
  } | null;
}

/** The product's `campaignMedia` metafield. */
export interface CampaignMediaField {
  readonly references?: {
    readonly nodes?: readonly (CampaignMediaNode | null)[] | null;
  } | null;
}

/**
 * The images to lead with: the first entry whose campaign is live for this
 * visitor, in the order the product lists them. Empty when none is.
 */
export const campaignImages = (
  field: CampaignMediaField | null | undefined,
  view: CampaignView,
): CampaignImage[] => {
  for (const entry of field?.references?.nodes ?? []) {
    const campaign = toCampaign(entry?.campaign?.reference as CampaignNode | null);
    if (!campaign || !isCampaignLive(campaign, view)) continue;
    const images = (entry?.images?.references?.nodes ?? [])
      .map((node) => node?.image)
      .filter((image): image is CampaignImage => Boolean(image?.url));
    if (images.length > 0) return images;
  }
  return [];
};

/** A gallery led by the campaign's images, without showing one twice. */
export const withCampaignImages = <T extends { readonly url: string }>(
  campaign: readonly T[],
  own: readonly T[],
): T[] => {
  const seen = new Set(campaign.map((image) => image.url.split("?")[0]));
  return [...campaign, ...own.filter((image) => !seen.has(image.url.split("?")[0]))];
};

import {
  campaignPath,
  isCampaignLive,
  toCampaign,
  type Campaign,
  type CampaignImage,
  type CampaignNode,
  type CampaignView,
} from "./campaign";

/**
 * The home page's hero slides (SHO-203), shared by web and the app; the theme
 * restates the order in sections/home-intro.liquid.
 *
 * - **While a campaign is live:** every live campaign first (the one that
 *   leads site-wide first: a previewed one, else by priority, then ending
 *   soonest), then the `hero_slide`s running now (no dates means always).
 * - **Otherwise:** the slides running now, then the default slides.
 * - **Nothing:** an empty list, and the everyday introduction shows.
 *
 * Within each group, higher `priority` first. A slide with no headline, a
 * link that isn't a path on the store, or dates the wrong way round is
 * dropped rather than shown half right.
 */

interface FieldValue {
  readonly value?: string | null;
}

interface FileField {
  readonly reference?: { readonly image?: CampaignImage | null } | null;
}

/** A `hero_slide` metaobject, as HeroSlideFields selects it. */
export interface HeroSlideNode {
  readonly handle: string;
  readonly headline?: FieldValue | null;
  readonly text?: FieldValue | null;
  readonly buttonLabel?: FieldValue | null;
  readonly link?: FieldValue | null;
  readonly image?: FileField | null;
  readonly mobileImage?: FileField | null;
  readonly startsAt?: FieldValue | null;
  readonly endsAt?: FieldValue | null;
  readonly priority?: FieldValue | null;
  readonly isDefault?: FieldValue | null;
}

export interface HeroSlide {
  /** Stable across renders: the campaign's or the slide's handle. */
  readonly key: string;
  readonly headline: string;
  readonly text: string | null;
  readonly buttonLabel: string | null;
  /** A path on the store, or null for no button. */
  readonly href: string | null;
  readonly image: CampaignImage | null;
  readonly mobileImage: CampaignImage | null;
  /** Set for a campaign's slide, so surfaces can show its badge and end time. */
  readonly campaign: Campaign | null;
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

/** Only paths on this store: a slide is never a way off the site. */
const isStorePath = (href: string) => href.startsWith("/") && !href.startsWith("//");

interface DatedSlide {
  readonly slide: HeroSlide;
  readonly priority: number;
  readonly isDefault: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

const toDatedSlide = (node: HeroSlideNode | null | undefined): DatedSlide | null => {
  if (!node?.handle) return null;
  const headline = text(node.headline);
  if (!headline) return null;
  const link = text(node.link);
  if (link && !isStorePath(link)) return null;
  const startsAt = date(node.startsAt);
  const endsAt = date(node.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) return null;
  return {
    slide: {
      key: `slide:${node.handle}`,
      headline,
      text: text(node.text),
      buttonLabel: link ? (text(node.buttonLabel) ?? "Shop now") : null,
      href: link,
      image: node.image?.reference?.image ?? null,
      mobileImage: node.mobileImage?.reference?.image ?? null,
      campaign: null,
    },
    priority: Number.parseInt(text(node.priority) ?? "", 10) || 0,
    isDefault: text(node.isDefault) === "true",
    startsAt,
    endsAt,
  };
};

/** A live campaign as a slide: its headline, offer, image and landing page. */
export const campaignSlide = (campaign: Campaign): HeroSlide => ({
  key: `campaign:${campaign.handle}`,
  headline: campaign.headline,
  text: campaign.offer,
  buttonLabel: `Shop the ${campaign.badge} offer`,
  href: campaignPath(campaign.handle),
  image: campaign.image,
  mobileImage: null,
  campaign,
});

export const heroSlides = (
  campaignNodes: readonly (CampaignNode | null | undefined)[],
  slideNodes: readonly (HeroSlideNode | null | undefined)[],
  view: CampaignView,
): HeroSlide[] => {
  const live = campaignNodes
    .map(toCampaign)
    .filter((campaign): campaign is Campaign => campaign !== null)
    .filter((campaign) => isCampaignLive(campaign, view))
    .sort(
      (a, b) =>
        Number(b.handle === view.preview) - Number(a.handle === view.preview) ||
        b.priority - a.priority ||
        a.endsAt.getTime() - b.endsAt.getTime(),
    );

  const slides = slideNodes
    .map(toDatedSlide)
    .filter((slide): slide is DatedSlide => slide !== null)
    .sort((a, b) => b.priority - a.priority);
  const running = (slide: DatedSlide) =>
    (!slide.startsAt || slide.startsAt <= view.now) &&
    (!slide.endsAt || view.now < slide.endsAt);
  const regular = slides.filter((slide) => !slide.isDefault && running(slide));
  const defaults = slides.filter((slide) => slide.isDefault && running(slide));

  return live.length > 0
    ? [...live.map(campaignSlide), ...regular.map((s) => s.slide)]
    : [...regular, ...defaults].map((s) => s.slide);
};

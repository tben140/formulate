import {
  campaignCartProgress,
  offerLines,
  type Cart,
  type OfferRules,
} from "@formulate/shopify";

/**
 * A tiered or bundle campaign in the cart (SHO-169): what's reached, and how
 * far to the next step ("Spend £12.00 more on Black Friday items for 25%
 * off"). Shopify works out the discount at checkout; this describes it. The
 * app's cart and the theme's drawer say the same, from the same function.
 */
export const CampaignCartHint = ({
  campaign,
  lines,
}: {
  readonly campaign: {
    readonly handle: string;
    readonly badge: string;
    readonly rules: OfferRules | null;
  };
  readonly lines: Cart["lines"]["nodes"];
}) => {
  const progress = campaignCartProgress(
    campaign.rules,
    offerLines(campaign, lines),
    campaign.badge,
  );
  if (!progress) return null;
  return (
    <div className="border-b border-border bg-brand-50 px-4 py-3 text-sm">
      {progress.reached ? <p className="font-semibold">{progress.reached}</p> : null}
      {progress.next ? <p>{progress.next}</p> : null}
    </div>
  );
};

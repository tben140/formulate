import { campaignEndsLabel, campaignPath, type Campaign } from "@formulate/shopify";
import Link from "next/link";

import { CampaignBadge } from "@/components/campaign-badge";

/**
 * The campaign on a product page (SHO-169): the offer as Shopify will apply it
 * at checkout, the real end time, and what subscribers get instead. No
 * strikethrough price: the discount is taken at checkout, so the page states
 * it rather than inventing a "was" price.
 *
 * `variants` names the variants covered when the campaign doesn't cover all.
 */
export const CampaignOffer = ({
  campaign,
  variants,
}: {
  readonly campaign: Campaign;
  readonly variants: readonly string[] | null;
}) => (
  <aside
    aria-label={campaign.title}
    className="mt-4 rounded-lg border border-brand-300 bg-brand-50 p-4 text-sm"
  >
    <div className="flex flex-wrap items-center gap-2">
      <CampaignBadge label={campaign.badge} />
      <span className="text-foreground-muted">{campaignEndsLabel(campaign)}</span>
    </div>
    <p className="mt-2 font-semibold text-foreground">
      {campaign.offer}
      {variants ? ` (${variants.join(", ")} only)` : null}
    </p>
    {campaign.subscriberPerk ? (
      <p className="mt-1 text-foreground-muted">{campaign.subscriberPerk}.</p>
    ) : null}
    <Link
      href={campaignPath(campaign.handle)}
      className="mt-2 inline-block underline underline-offset-4"
    >
      See the {campaign.badge} offer and terms
    </Link>
  </aside>
);

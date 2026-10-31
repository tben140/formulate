import { campaignEndsLabel, campaignPath, type Campaign } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";

import { CampaignBadge } from "@/components/campaign-badge";
import { CampaignEnds } from "@/components/campaign-ends";

/**
 * The home page's hero while a campaign is live (SHO-169 merchandising): its
 * headline, offer and real end time, and a way in, in place of the everyday
 * introduction. It goes back by itself when the campaign ends, as the banner
 * does. The app's home and the theme's home-intro section say the same.
 */
export const CampaignHero = ({
  campaign,
  now,
  clockPreview,
}: {
  readonly campaign: Campaign;
  readonly now: number;
  readonly clockPreview: boolean;
}) => (
  <section
    aria-labelledby="home-intro"
    className="grid items-center gap-8 overflow-hidden rounded-xl bg-brand-50 px-6 py-12 sm:px-10 md:grid-cols-2"
  >
    <div>
      <CampaignBadge label={campaign.badge} />
      <h1
        id="home-intro"
        className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-balance"
      >
        {campaign.headline}
      </h1>
      <p className="mt-4 max-w-xl text-lg text-foreground">{campaign.offer}</p>
      <p className="mt-2 text-foreground">
        <CampaignEnds
          endsAt={campaign.endsAt.toISOString()}
          label={campaignEndsLabel(campaign)}
          now={now}
          clockPreview={clockPreview}
        />
      </p>
      <Link
        href={campaignPath(campaign.handle)}
        className="mt-8 inline-block rounded-md bg-brand-600 px-6 py-3 font-semibold text-surface hover:bg-brand-700"
      >
        Shop the {campaign.badge} offer
      </Link>
    </div>
    {campaign.image ? (
      <div className="overflow-hidden rounded-lg">
        <Image
          data={campaign.image}
          sizes="(min-width: 768px) 45vw, 90vw"
          className="h-auto w-full"
          loading="eager"
          fetchPriority="high"
        />
      </div>
    ) : null}
  </section>
);

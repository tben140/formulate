import { campaignEndsLabel, campaignPath, type Campaign } from "@formulate/shopify";
import Link from "next/link";

/**
 * The live campaign, under the demo notice on every page (SHO-169). The end
 * time is the real one, from the campaign: no countdown, so nothing can drift
 * from it. The theme's `sections/campaign-banner.liquid` says the same.
 */
export const CampaignBanner = ({ campaign }: { readonly campaign: Campaign }) => (
  <div className="bg-brand-700 px-4 py-2 text-center text-sm text-surface">
    <p className="mx-auto max-w-5xl">
      <Link
        href={campaignPath(campaign.handle)}
        className="font-semibold underline underline-offset-4"
      >
        {campaign.bannerText}
      </Link>{" "}
      <span className="whitespace-nowrap">· {campaignEndsLabel(campaign)}</span>
    </p>
  </div>
);

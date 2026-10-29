import {
  campaignEndsLabel,
  campaignPath,
  campaignStartsLabel,
  type Campaign,
} from "@formulate/shopify";
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

/**
 * Shown while a campaign is being previewed through its preview link, so it's
 * never mistaken for the live site. The discount itself follows its own dates.
 */
export const CampaignPreviewStrip = ({ campaign }: { readonly campaign: Campaign }) => (
  <div className="border-b-2 border-dashed border-brand-700 bg-brand-100 px-4 py-2 text-center text-sm text-foreground">
    <p className="mx-auto max-w-5xl">
      <strong className="font-semibold">Previewing {campaign.title}</strong> in this
      browser only. Checkout applies the discount from its real start (
      {campaignStartsLabel(campaign).replace("Starts ", "")}).{" "}
      {/* A route, not a client action: it clears an httpOnly cookie. */}
      <a
        href="/campaign-preview/stop"
        className="font-semibold underline underline-offset-4"
      >
        Stop preview
      </a>
    </p>
  </div>
);

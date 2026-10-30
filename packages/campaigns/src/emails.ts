import { campaignEndsLabel } from "@formulate/shopify";

import { campaignOf } from "./campaign-node";
import type { CampaignEntry } from "./types";

const HOUR = 60 * 60 * 1000;

/** One email a campaign sends, timed from its dates. */
export interface PlannedEmail {
  readonly name: string;
  readonly sendAt: string;
  readonly subject: string;
  readonly previewText: string;
}

/**
 * The emails a campaign sends, from its record, so the times can't drift
 * from the offer: early access when that opens, the launch when it starts,
 * and "last day" 24 hours before it ends. `campaigns emails --create` makes them as Klaviyo drafts, never
 * scheduled: sending stays Ben's call (docs/campaigns.md).
 */
export const plannedEmails = (entry: CampaignEntry): PlannedEmail[] => {
  const campaign = campaignOf(entry);
  if (!campaign) return [];
  const { title, headline, offer } = campaign;
  const startsAt = campaign.startsAt.getTime();
  const endsAt = campaign.endsAt.getTime();
  const lastDay = endsAt - 24 * HOUR;
  const emails: PlannedEmail[] = [];
  // Early access: the email's link (/discount/<code>?redirect=…) is the way in.
  if (campaign.earlyAccessStartsAt) {
    emails.push({
      name: `${title}: early access`,
      sendAt: campaign.earlyAccessStartsAt.toISOString(),
      subject: `Early access: ${offer}`,
      previewText: "Open this email's link to shop before everyone else.",
    });
  }
  emails.push({
    name: `${title}: launch`,
    sendAt: new Date(startsAt).toISOString(),
    subject: headline,
    previewText: offer,
  });
  // Only when the campaign runs for longer than a day.
  if (lastDay > startsAt + 12 * HOUR) {
    emails.push({
      name: `${title}: last day`,
      sendAt: new Date(lastDay).toISOString(),
      subject: `Last day: ${offer}`,
      previewText: `${title}. ${campaignEndsLabel(campaign)}.`,
    });
  }
  return emails;
};

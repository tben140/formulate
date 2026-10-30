import { campaignEndsLabel, campaignPath } from "@formulate/shopify";

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

/** One push notification a campaign sends, timed from its dates. */
export interface PlannedPush {
  readonly name: string;
  readonly sendAt: string;
  readonly title: string;
  readonly body: string;
  /** Opens the campaign screen: the app's scheme and the shared path. */
  readonly deepLink: string;
}

/** The app's URL scheme (apps/mobile/app.config.ts). */
export const APP_SCHEME = "formulate";

/**
 * The pushes a campaign sends (SHO-169), as the emails: the launch, and the
 * last day. Only to people who chose offer notifications (`push_offers`, see
 * SHO-165), so `campaigns pushes --create` needs that segment's id. Kept
 * short: lock screens cut titles at about 40 characters.
 */
export const plannedPushes = (entry: CampaignEntry): PlannedPush[] => {
  const campaign = campaignOf(entry);
  if (!campaign) return [];
  const deepLink = `${APP_SCHEME}://${campaignPath(campaign.handle).slice(1)}`;
  const pushes: PlannedPush[] = [
    {
      name: `${campaign.title}: launch push`,
      sendAt: campaign.startsAt.toISOString(),
      title: `${campaign.badge} is on`,
      body: campaign.offer,
      deepLink,
    },
  ];
  const lastDay = campaign.endsAt.getTime() - 24 * HOUR;
  if (lastDay > campaign.startsAt.getTime() + 12 * HOUR) {
    pushes.push({
      name: `${campaign.title}: last day push`,
      sendAt: new Date(lastDay).toISOString(),
      title: `Last day of ${campaign.badge}`,
      body: `${campaign.offer}. ${campaignEndsLabel(campaign)}.`,
      deepLink,
    });
  }
  return pushes;
};

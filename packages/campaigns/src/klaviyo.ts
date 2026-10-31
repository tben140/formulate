import type { PlannedEmail } from "./emails";
import type { EmailInfo } from "./types";

/**
 * Klaviyo for the campaigns CLI: reading a campaign's emails for the checks,
 * and creating planned ones as drafts. Never scheduling or sending: that
 * stays Ben's call. KLAVIYO_PRIVATE_KEY comes from the environment only.
 */

const REVISION = "2025-10-15";
const BASE = "https://a.klaviyo.com/api";

/** The newsletter list (apps/api's KLAVIYO_LIST_ID): public, not a secret. */
export const DEFAULT_LIST_ID = "XPJ8ic";

const headers = (key: string) => ({
  authorization: `Klaviyo-API-Key ${key}`,
  revision: REVISION,
  accept: "application/vnd.api+json",
  "content-type": "application/vnd.api+json",
});

interface CampaignResource {
  id: string;
  attributes: {
    name: string;
    status: string;
    send_time?: string | null;
    scheduled_at?: string | null;
    send_strategy?: { datetime?: string | null } | null;
  };
  relationships?: { "campaign-messages"?: { data: { id: string }[] } };
}

interface MessageResource {
  id: string;
  attributes: { definition?: { content?: { subject?: string; preview_text?: string } } };
}

/** Email campaigns whose name contains `title`, with subject and preview text. */
export const getEmails = async (key: string, title: string): Promise<EmailInfo[]> => {
  // Double quotes, so a title with an apostrophe (Father's Day) stays one literal.
  const filter = `and(equals(messages.channel,'email'),contains(name,${JSON.stringify(title)}))`;
  const campaigns: CampaignResource[] = [];
  const messages = new Map<string, MessageResource>();
  let url: string | null =
    `${BASE}/campaigns?filter=${encodeURIComponent(filter)}&include=campaign-messages`;
  while (url) {
    const response = await fetch(url, { headers: headers(key) });
    if (!response.ok) throw new Error(`Klaviyo: HTTP ${response.status}`);
    const body = (await response.json()) as {
      data: CampaignResource[];
      included?: MessageResource[];
      links?: { next?: string | null };
    };
    campaigns.push(...body.data);
    for (const message of body.included ?? []) messages.set(message.id, message);
    url = body.links?.next ?? null;
  }
  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.attributes.name,
    status: campaign.attributes.status,
    sendAt:
      campaign.attributes.send_time ??
      campaign.attributes.scheduled_at ??
      campaign.attributes.send_strategy?.datetime ??
      null,
    text: (campaign.relationships?.["campaign-messages"]?.data ?? [])
      .map((ref) => messages.get(ref.id)?.attributes.definition?.content)
      .flatMap((content) => [content?.subject ?? "", content?.preview_text ?? ""])
      .join(" "),
  }));
};

/** A draft email campaign for a planned email, to the list, at its time. */
export const createDraft = async (
  key: string,
  email: PlannedEmail,
  listId: string = DEFAULT_LIST_ID,
): Promise<string> => {
  const response = await fetch(`${BASE}/campaigns`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      data: {
        type: "campaign",
        attributes: {
          name: email.name,
          audiences: { included: [listId] },
          send_strategy: { method: "static", datetime: email.sendAt },
          "campaign-messages": {
            data: [
              {
                type: "campaign-message",
                attributes: {
                  definition: {
                    channel: "email",
                    label: email.name,
                    content: { subject: email.subject, preview_text: email.previewText },
                  },
                },
              },
            ],
          },
        },
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Klaviyo: HTTP ${response.status} creating "${email.name}"`);
  return ((await response.json()) as { data: { id: string } }).data.id;
};

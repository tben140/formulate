import type { PlannedEmail, PlannedPush } from "./emails";
import type { FlowMetrics } from "./flows";
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

/** The names of push campaigns whose name contains `title`, from every page. */
export const getPushNames = async (key: string, title: string): Promise<string[]> => {
  const filter = `and(equals(messages.channel,'mobile_push'),contains(name,${JSON.stringify(title)}))`;
  const names: string[] = [];
  let url: string | null =
    `${BASE}/campaigns?filter=${encodeURIComponent(filter)}&fields[campaign]=name`;
  while (url) {
    const response = await fetch(url, { headers: headers(key) });
    if (!response.ok) throw new Error(`Klaviyo: HTTP ${response.status}`);
    const body = (await response.json()) as {
      data: { attributes: { name: string } }[];
      links?: { next?: string | null };
    };
    names.push(...body.data.map((campaign) => campaign.attributes.name));
    url = body.links?.next ?? null;
  }
  return names;
};

/**
 * A draft push campaign for a planned push, to `segmentId` (people who chose
 * offer notifications), opening the campaign screen. Never scheduled.
 */
export const createPushDraft = async (
  key: string,
  push: PlannedPush,
  segmentId: string,
): Promise<string> => {
  const response = await fetch(`${BASE}/campaigns`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      data: {
        type: "campaign",
        attributes: {
          name: push.name,
          audiences: { included: [segmentId] },
          send_strategy: { method: "static", datetime: push.sendAt },
          "campaign-messages": {
            data: [
              {
                type: "campaign-message",
                attributes: {
                  definition: {
                    channel: "mobile_push",
                    notification_type: "standard",
                    content: { title: push.title, body: push.body },
                    options: {
                      on_open: {
                        type: "deep_link",
                        ios_deep_link: push.deepLink,
                        android_deep_link: push.deepLink,
                      },
                    },
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
    throw new Error(`Klaviyo: HTTP ${response.status} creating "${push.name}"`);
  return ((await response.json()) as { data: { id: string } }).data.id;
};

/**
 * A Klaviyo coupon holding a campaign's personal codes, so an email inserts
 * one per recipient: {% coupon_code '<id>' %}. The id is our own (Klaviyo's
 * external_id), e.g. "BLACK_FRIDAY_2026". Creating it sends nothing.
 */
export const createCoupon = async (
  key: string,
  id: string,
  description: string,
): Promise<void> => {
  const response = await fetch(`${BASE}/coupons`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      data: { type: "coupon", attributes: { external_id: id, description } },
    }),
  });
  // 409: it exists already, from an earlier run; the codes still go in.
  if (!response.ok && response.status !== 409)
    throw new Error(`Klaviyo: HTTP ${response.status} creating coupon ${id}`);
};

/** Uploads codes to a coupon, 1,000 per job (Klaviyo's limit), expiring with the campaign. */
export const uploadCouponCodes = async (
  key: string,
  couponId: string,
  codes: readonly string[],
  expiresAt: string,
): Promise<number> => {
  let jobs = 0;
  for (let i = 0; i < codes.length; i += 1000) {
    const response = await fetch(`${BASE}/coupon-code-bulk-create-jobs`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        data: {
          type: "coupon-code-bulk-create-job",
          attributes: {
            "coupon-codes": {
              data: codes.slice(i, i + 1000).map((code) => ({
                type: "coupon-code",
                attributes: { unique_code: code, expires_at: expiresAt },
                relationships: { coupon: { data: { type: "coupon", id: couponId } } },
              })),
            },
          },
        },
      }),
    });
    if (!response.ok)
      throw new Error(`Klaviyo: HTTP ${response.status} uploading codes to ${couponId}`);
    jobs++;
  }
  return jobs;
};

/** Shopify's checkout and order metrics in this Klaviyo account, by name. */
export const shopifyFlowMetrics = async (key: string): Promise<FlowMetrics> => {
  const response = await fetch(
    `${BASE}/metrics?filter=${encodeURIComponent("equals(integration.category,'eCommerce')")}`,
    { headers: headers(key) },
  );
  if (!response.ok) throw new Error(`Klaviyo: HTTP ${response.status} reading metrics`);
  const { data } = (await response.json()) as {
    data: { id: string; attributes: { name: string; integration?: { key?: string } } }[];
  };
  const find = (name: string) =>
    data.find(
      (m) => m.attributes.name === name && m.attributes.integration?.key === "shopify",
    )?.id;
  const checkoutStarted = find("Checkout Started");
  const placedOrder = find("Placed Order");
  if (!checkoutStarted || !placedOrder)
    throw new Error(
      "Klaviyo has no Shopify Checkout Started or Placed Order metric yet.",
    );
  return { checkoutStarted, placedOrder };
};

/** Creates a flow. Klaviyo creates flows as drafts; nothing sends until it's switched on. */
export const createFlow = async (
  key: string,
  flow: { name: string; definition: unknown },
): Promise<string> => {
  const response = await fetch(`${BASE}/flows`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ data: { type: "flow", attributes: flow } }),
  });
  if (!response.ok)
    throw new Error(`Klaviyo: HTTP ${response.status} creating "${flow.name}"`);
  return ((await response.json()) as { data: { id: string } }).data.id;
};

/** Sets a property on a profile, by email (profile-import upserts). Sends nothing. */
export const setProfileProperty = async (
  key: string,
  email: string,
  property: string,
  value: string,
): Promise<void> => {
  const response = await fetch(`${BASE}/profile-import`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      data: { type: "profile", attributes: { email, properties: { [property]: value } } },
    }),
  });
  if (!response.ok)
    throw new Error(`Klaviyo: HTTP ${response.status} updating a profile`);
};

/** A list by its exact name, or null when there's none. Read only. */
export const getListByName = async (
  key: string,
  name: string,
): Promise<{ id: string } | null> => {
  const filter = `equals(name,${JSON.stringify(name)})`;
  const response = await fetch(`${BASE}/lists?filter=${encodeURIComponent(filter)}`, {
    headers: headers(key),
  });
  if (!response.ok) throw new Error(`Klaviyo: HTTP ${response.status}`);
  const body = (await response.json()) as { data: { id: string }[] };
  return body.data[0] ? { id: body.data[0].id } : null;
};

/** A list's members: profile id and email (lower-cased, or null). Read only. */
export const getListMembers = async (
  key: string,
  listId: string,
): Promise<{ id: string; email: string | null }[]> => {
  const members: { id: string; email: string | null }[] = [];
  let url: string | null =
    `${BASE}/lists/${encodeURIComponent(listId)}/profiles?fields[profile]=email&page[size]=100`;
  while (url) {
    const response = await fetch(url, { headers: headers(key) });
    if (!response.ok) throw new Error(`Klaviyo: HTTP ${response.status}`);
    const body = (await response.json()) as {
      data: { id: string; attributes: { email?: string | null } }[];
      links?: { next?: string | null };
    };
    for (const profile of body.data)
      members.push({
        id: profile.id,
        email: profile.attributes.email?.toLowerCase() ?? null,
      });
    url = body.links?.next ?? null;
  }
  return members;
};

/** Every email address on a list, lower-cased. Read only. */
export const getListEmails = async (key: string, listId: string): Promise<string[]> =>
  (await getListMembers(key, listId)).flatMap((member) => member.email ?? []);

/**
 * The flows a list triggers, with their status. Adding someone to a list that
 * triggers a live flow can send them a message, so the segment sync changes
 * no list that does (docs/campaign-segments.md, How membership is kept).
 */
export const getListFlows = async (
  key: string,
  listId: string,
): Promise<{ id: string; name: string; status: string }[]> => {
  const response = await fetch(
    `${BASE}/lists/${encodeURIComponent(listId)}/flow-triggers?fields[flow]=name,status`,
    { headers: headers(key) },
  );
  if (!response.ok)
    throw new Error(`Klaviyo: HTTP ${response.status} reading a list's flows`);
  const body = (await response.json()) as {
    data: { id: string; attributes: { name: string; status: string } }[];
  };
  return body.data.map((flow) => ({
    id: flow.id,
    name: flow.attributes.name,
    status: flow.attributes.status,
  }));
};

/** Creates a static list. A new list triggers no flow, so this sends nothing. */
export const createList = async (key: string, name: string): Promise<string> => {
  const response = await fetch(`${BASE}/lists`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ data: { type: "list", attributes: { name } } }),
  });
  if (!response.ok)
    throw new Error(`Klaviyo: HTTP ${response.status} creating "${name}"`);
  return ((await response.json()) as { data: { id: string } }).data.id;
};

/**
 * Adds people to a list by email, through a bulk profile import (10,000 per
 * job, Klaviyo's limit). It creates any profile that doesn't exist and leaves
 * marketing consent as it is: being on a list doesn't subscribe anyone, and
 * campaigns still go only to the subscribed. Returns the number of jobs.
 */
export const addEmailsToList = async (
  key: string,
  listId: string,
  emails: readonly string[],
): Promise<number> => {
  let jobs = 0;
  for (let i = 0; i < emails.length; i += 10_000) {
    const response = await fetch(`${BASE}/profile-bulk-import-jobs`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        data: {
          type: "profile-bulk-import-job",
          attributes: {
            profiles: {
              data: emails
                .slice(i, i + 10_000)
                .map((email) => ({ type: "profile", attributes: { email } })),
            },
          },
          relationships: { lists: { data: [{ type: "list", id: listId }] } },
        },
      }),
    });
    if (!response.ok)
      throw new Error(`Klaviyo: HTTP ${response.status} adding profiles to ${listId}`);
    jobs++;
  }
  return jobs;
};

/** Takes profiles off a list (1,000 per request, Klaviyo's limit). Deletes no profile. */
export const removeFromList = async (
  key: string,
  listId: string,
  profileIds: readonly string[],
): Promise<void> => {
  for (let i = 0; i < profileIds.length; i += 1000) {
    const response = await fetch(
      `${BASE}/lists/${encodeURIComponent(listId)}/relationships/profiles`,
      {
        method: "DELETE",
        headers: headers(key),
        body: JSON.stringify({
          data: profileIds.slice(i, i + 1000).map((id) => ({ type: "profile", id })),
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Klaviyo: HTTP ${response.status} removing profiles from ${listId}`,
      );
  }
};

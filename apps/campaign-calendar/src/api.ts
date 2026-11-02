import { calendar } from "@formulate/campaigns/calendar";
import { checkCampaign } from "@formulate/campaigns/check";
import { duplicateFields, previewOffer } from "@formulate/campaigns/offer-preview";
import { syncCampaign } from "@formulate/campaigns/run-sync";
import {
  TEMPLATES,
  templateFields,
  type TemplateName,
} from "@formulate/campaigns/templates";
import { parseOfferRules } from "@formulate/shopify";
import {
  approveCampaign,
  createCampaign,
  getCollection,
  getDiscounts,
  getEntries,
  getEntry,
  setCampaignField,
} from "@formulate/campaigns/shopify-data";
import type { Snapshot } from "@formulate/campaigns/types";
import type { Admin } from "@formulate/campaigns/admin";

import { retailDays } from "./retail";

/** Campaign handles as Shopify makes them; anything else is refused. */
export const HANDLE = /^[a-z0-9-]{1,64}$/;

export interface Links {
  readonly web: string | null;
  readonly app: string | null;
}

/**
 * Preview links (SHO-169) for one campaign: web's signed-cookie route and
 * the app's deep link, both carrying the preview token. Staff only: the page
 * is inside the admin, behind a verified session.
 */
export const previewLinks = (
  handle: string,
  webUrl: string,
  token: string | undefined,
): Links =>
  token && token.length >= 24
    ? {
        web: `${webUrl}/pages/campaigns/${handle}/preview?token=${encodeURIComponent(token)}`,
        app: `formulate://pages/campaigns/${handle}?preview=${encodeURIComponent(token)}`,
      }
    : { web: null, app: null };

/** Every campaign by date, what needs attention, and this year's and next year's retail days. */
export const calendarData = async (
  admin: Admin,
  options: { webUrl: string; previewToken?: string; now?: Date },
) => {
  const now = options.now ?? new Date();
  const result = calendar(await getEntries(admin), now);
  const year = now.getUTCFullYear();
  return {
    now: now.toISOString(),
    rows: result.rows.map((row) => ({
      ...row,
      preview: previewLinks(row.handle, options.webUrl, options.previewToken),
    })),
    notes: result.notes,
    retail: [...retailDays(year), ...retailDays(year + 1)],
  };
};

/** Everything the checks look at, without Klaviyo (no key here). */
const loadSnapshot = async (admin: Admin, handle: string): Promise<Snapshot | null> => {
  const entry = await getEntry(admin, handle);
  if (!entry) return null;
  const linked = entry.fields.collection
    ? await getCollection(admin, entry.fields.collection, entry.id)
    : null;
  return {
    entry,
    collection: linked?.collection ?? null,
    products: linked?.products ?? [],
    discounts: await getDiscounts(admin, { includeExpired: false }),
    emails: null,
  };
};

/** The go-live checklist: `campaigns check`, without Klaviyo (no key here). */
export const checklist = async (admin: Admin, handle: string, now: Date = new Date()) => {
  const snapshot = await loadSnapshot(admin, handle);
  if (!snapshot) return null;
  const { entry } = snapshot;
  return {
    handle,
    title: entry.fields.title ?? handle,
    fields: entry.fields,
    findings: checkCampaign(snapshot, now),
  };
};

export const signOff = async (
  admin: Admin,
  handle: string,
  by: string,
  now: Date = new Date(),
) => {
  const entry = await getEntry(admin, handle);
  if (!entry) return false;
  await approveCampaign(admin, entry.id, by, now);
  return true;
};

/**
 * The offer editor (SHO-206): the saved offer and the edited one, side by
 * side: terms, worst margins. Nothing is written.
 */
export const offerPreview = async (admin: Admin, handle: string, offerRules: string) => {
  const snapshot = await loadSnapshot(admin, handle);
  if (!snapshot) return null;
  const saved = snapshot.entry.fields.offer_rules;
  return {
    saved: saved ? { rules: saved, preview: previewOffer(snapshot, saved) } : null,
    edited: previewOffer(snapshot, offerRules),
  };
};

/**
 * Saves the offer's rules and updates its discounts, as `campaigns sync`.
 * A new discount starts switched off; switching it on stays a separate step
 * in Shopify's admin. Editing the record clears its sign-off in effect: the
 * checklist asks for a new one.
 */
export const saveOffer = async (admin: Admin, handle: string, offerRules: string) => {
  if (!parseOfferRules(offerRules))
    return { saved: false as const, error: "These rules don't parse." };
  const before = await loadSnapshot(admin, handle);
  if (!before) return null;
  await setCampaignField(admin, before.entry.id, "offer_rules", offerRules);
  const after = await loadSnapshot(admin, handle);
  if (!after) return null;
  try {
    return { saved: true as const, synced: await syncCampaign(admin, after) };
  } catch (error) {
    return {
      saved: true as const,
      synced: [],
      error: `Saved, but the discount wasn't updated: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const parseWhen = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** A new draft: a copy of a campaign with new dates, or a template. */
export const newCampaign = async (
  admin: Admin,
  input: {
    from?: unknown;
    template?: unknown;
    handle?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
  },
): Promise<{ created: string } | { error: string }> => {
  const handle = typeof input.handle === "string" ? input.handle : "";
  if (!HANDLE.test(handle))
    return { error: "Handles are lowercase letters, digits and hyphens." };
  const startsAt = parseWhen(input.startsAt);
  const endsAt = parseWhen(input.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt)
    return { error: "Give a start and an end, the start first." };
  let fields: { key: string; value: string }[];
  if (typeof input.from === "string") {
    if (!HANDLE.test(input.from)) return { error: "No such campaign." };
    const source = await getEntry(admin, input.from);
    if (!source) return { error: "No such campaign." };
    fields = duplicateFields(source, startsAt, endsAt);
  } else if (
    typeof input.template === "string" &&
    Object.hasOwn(TEMPLATES, input.template)
  ) {
    fields = templateFields(input.template as TemplateName, startsAt, endsAt);
  } else {
    return { error: "Choose a campaign to copy or a template." };
  }
  if (await getEntry(admin, handle)) return { error: `"${handle}" is taken.` };
  await createCampaign(admin, { handle, fields });
  return { created: handle };
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

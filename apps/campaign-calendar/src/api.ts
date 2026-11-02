import { calendar } from "@formulate/campaigns/calendar";
import { checkCampaign } from "@formulate/campaigns/check";
import {
  approveCampaign,
  getCollection,
  getDiscounts,
  getEntries,
  getEntry,
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

/** The go-live checklist: `campaigns check`, without Klaviyo (no key here). */
export const checklist = async (admin: Admin, handle: string, now: Date = new Date()) => {
  const entry = await getEntry(admin, handle);
  if (!entry) return null;
  const linked = entry.fields.collection
    ? await getCollection(admin, entry.fields.collection, entry.id)
    : null;
  const snapshot: Snapshot = {
    entry,
    collection: linked?.collection ?? null,
    products: linked?.products ?? [],
    discounts: await getDiscounts(admin, { includeExpired: false }),
    emails: null,
  };
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

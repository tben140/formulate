import { calendar } from "@formulate/campaigns/calendar";
import { checkCampaign } from "@formulate/campaigns/check";
import { duplicateFields, previewOffer } from "@formulate/campaigns/offer-preview";
import { campaignOf } from "@formulate/campaigns/campaign-node";
import { cohort } from "@formulate/campaigns/cohort";
import { earnedRewards, REFERRAL_PREFIX } from "@formulate/campaigns/referrals";
import { campaignReport, type ReportOrder } from "@formulate/campaigns/report";
import { syncCampaign } from "@formulate/campaigns/run-sync";
import {
  BASELINE_DAYS,
  campaignDays,
  campaignUplift,
  stockPlan,
  unitsByProduct,
} from "@formulate/campaigns/stock-plan";
import { campaignDiscounts } from "@formulate/campaigns/sync";
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
  getBuyerContacts,
  getEntry,
  getOrders,
  getRecentSales,
  setCampaignField,
  tidyCampaign,
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
const loadSnapshot = async (
  admin: Admin,
  handle: string,
  includeExpired = false,
): Promise<Snapshot | null> => {
  const entry = await getEntry(admin, handle);
  if (!entry) return null;
  const linked = entry.fields.collection
    ? await getCollection(admin, entry.fields.collection, entry.id)
    : null;
  return {
    entry,
    collection: linked?.collection ?? null,
    products: linked?.products ?? [],
    discounts: await getDiscounts(admin, { includeExpired }),
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

const DAY = 24 * 60 * 60 * 1000;
const iso = (at: number) => new Date(at).toISOString();

/**
 * Stock against the plan (SHO-209): each product's likely sales during the
 * campaign against its stock. The uplift is the last ended campaign's, when
 * there is one with sales on both sides, otherwise the default.
 */
export const stockFor = async (admin: Admin, handle: string, now: Date = new Date()) => {
  const snapshot = await loadSnapshot(admin, handle);
  if (!snapshot) return null;
  const campaign = campaignOf(snapshot.entry);
  if (!campaign) return { error: "The campaign can't be read; run its checklist." };
  const recent = unitsByProduct(
    await getRecentSales(admin, iso(now.getTime() - BASELINE_DAYS * DAY)),
  );

  let uplift: number | null = null;
  let upliftFrom: string | null = null;
  const past = (await getEntries(admin))
    .map((entry) => ({ entry, past: campaignOf(entry) }))
    .filter(({ entry, past }) => entry.handle !== handle && past && past.endsAt <= now)
    .sort((a, b) => b.past!.endsAt.getTime() - a.past!.endsAt.getTime())[0];
  if (past?.past) {
    const start = past.past.startsAt.getTime();
    const end = past.past.endsAt.getTime();
    const during = unitsByProduct(await getRecentSales(admin, iso(start), iso(end)));
    const before = unitsByProduct(
      await getRecentSales(admin, iso(start - BASELINE_DAYS * DAY), iso(start)),
    );
    uplift = campaignUplift(
      during,
      campaignDays(past.past.startsAt, past.past.endsAt),
      before,
      BASELINE_DAYS,
    );
    if (uplift) upliftFrom = past.past.title;
  }

  const days = campaignDays(campaign.startsAt, campaign.endsAt);
  return {
    days,
    uplift: uplift ?? undefined,
    upliftFrom,
    lines: stockPlan(snapshot.products, recent, { days, ...(uplift ? { uplift } : {}) }),
  };
};

/**
 * Referral rewards earned (`campaigns referrals --rewards`), as counts: who
 * referred whom stays in the CLI, which is where a reward is issued.
 */
export const referralSummary = (
  orders: readonly ReportOrder[],
  contacts: readonly { customerId: string; code: string | null }[],
): { referrers: number; orders: number } => {
  const owners = new Map(
    contacts.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c.customerId]),
  );
  const uses = orders.flatMap((o) =>
    o.discounts
      .filter((d) => d.toUpperCase().startsWith(`${REFERRAL_PREFIX}-`))
      .map((code) => ({ order: o.name, code, friendCustomerId: o.customerId ?? null })),
  );
  const rewards = earnedRewards(uses, owners);
  return {
    referrers: rewards.length,
    orders: rewards.reduce((sum, r) => sum + r.orders.length, 0),
  };
};

/**
 * After a campaign: its results, as `campaigns report`, and what happened
 * next: did its buyers come back (`campaigns cohort`), and did their
 * referral codes bring friends (`campaigns referrals --rewards`).
 */
export const resultsFor = async (
  admin: Admin,
  handle: string,
  now: Date = new Date(),
) => {
  const snapshot = await loadSnapshot(admin, handle, true);
  if (!snapshot) return null;
  const campaign = campaignOf(snapshot.entry);
  if (!campaign) return { error: "The campaign can't be read; run its checklist." };
  if (campaign.endsAt > now) return { error: "Results show once it has ended." };
  const titles = campaignDiscounts(snapshot.entry, snapshot.discounts).flatMap((d) => [
    d.title,
    ...d.codes,
  ]);
  if (campaign.discountCode) titles.push(campaign.discountCode);
  let orders: ReportOrder[];
  try {
    // 90 days on, for the cohort; the report keeps to its usual week after.
    orders = await getOrders(
      admin,
      campaign.startsAt.toISOString(),
      new Date(campaign.endsAt.getTime() + 90 * DAY).toISOString(),
      titles,
    );
  } catch {
    return { error: "Couldn't read the orders." };
  }
  const reportUntil = campaign.endsAt.getTime() + 7 * DAY;
  const report = campaignReport(
    orders.filter((o) => new Date(o.createdAt).getTime() < reportUntil),
    { handle, discountTitles: titles },
  );
  const followUp = cohort(
    orders,
    {
      handle,
      discountTitles: titles,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    },
    now,
  );
  const buyers = [
    ...new Set(
      orders
        .filter(
          (o) =>
            o.customerId &&
            new Date(o.createdAt) < campaign.endsAt &&
            o.campaignDiscount > 0,
        )
        .map((o) => o.customerId!),
    ),
  ];
  const referrals = referralSummary(orders, await getBuyerContacts(admin, buyers));
  return { report, cohort: followUp, referrals };
};

/** The customer segments' sizes, as `campaigns segments --apply` stored them. */
export const parseSegmentCounts = (
  value: string | null | undefined,
): { syncedAt: string; counts: Record<string, number> } | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { syncedAt?: unknown; counts?: unknown };
    if (typeof parsed.syncedAt !== "string" || typeof parsed.counts !== "object")
      return null;
    const counts = Object.fromEntries(
      Object.entries(parsed.counts ?? {}).filter(
        ([key, n]) =>
          /^[a-z_]{1,20}$/.test(key) && Number.isInteger(n) && (n as number) >= 0,
      ),
    ) as Record<string, number>;
    return { syncedAt: parsed.syncedAt, counts };
  } catch {
    return null;
  }
};

/** Segment counts from the Campaign settings record (SHO-207). */
export const segmentsFor = async (admin: Admin) => {
  const data = await admin.request<{
    metaobjectByHandle: { field: { value: string | null } | null } | null;
  }>(
    `query Segments {
      metaobjectByHandle(handle: { type: "campaign_config", handle: "settings" }) {
        field(key: "segment_counts") { value }
      }
    }`,
  );
  return (
    parseSegmentCounts(data.metaobjectByHandle?.field?.value) ?? {
      error: "Not counted yet: run pnpm campaigns segments --apply.",
    }
  );
};

/**
 * After a campaign: takes it off its products and variants, deletes its
 * collection and returns the record to draft (`campaigns tidy`). Refused
 * while it's running.
 */
export const tidyFor = async (admin: Admin, handle: string, now: Date = new Date()) => {
  const snapshot = await loadSnapshot(admin, handle, true);
  if (!snapshot) return null;
  const campaign = campaignOf(snapshot.entry);
  if (campaign && campaign.endsAt > now)
    return { error: "It hasn't ended: nothing tidied." };
  const owners = snapshot.products.flatMap((product) => [
    ...(product.campaignId === snapshot.entry.id ? [product.id] : []),
    ...product.variants
      .filter((v) => v.campaignId === snapshot.entry.id)
      .map((v) => v.id),
  ]);
  await tidyCampaign(admin, {
    entryId: snapshot.entry.id,
    collectionId: snapshot.collection?.id ?? null,
    owners,
  });
  return { tidied: owners.length };
};

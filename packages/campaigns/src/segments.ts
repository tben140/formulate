import { lapsedCustomers } from "./audience";

/**
 * Customer segments (SHO-207, docs/campaign-segments.md): who is in each,
 * worked out from Recharge and Shopify, as Shopify customer GIDs. One
 * definition, read by `campaigns segments` today and, later, by the nightly
 * sync that tags customers (`segment:<key>`) and keeps Klaviyo lists.
 *
 * Pure: the CLI fetches, this decides. Thresholds come from the Campaign
 * settings record, so they can change without a release.
 */

export const SEGMENT_KEYS = [
  "active",
  "lapsed",
  "at_risk",
  "one_time",
  "dormant",
  "best",
] as const;

export type SegmentKey = (typeof SEGMENT_KEYS)[number];

/** What each segment means, in words, for the CLI and the calendar. */
export const describeSegment = (key: SegmentKey, t: Thresholds): string =>
  ({
    active: "an active subscription",
    lapsed: `every subscription cancelled, the last within ${t.lapsedMonths} months`,
    at_risk: `still subscribed, ${t.atRiskMisses}+ skipped or failed deliveries in ${t.atRiskDays} days`,
    one_time: "ordered, never subscribed",
    dormant: `last order ${t.dormantFromDays}–${t.dormantToDays} days ago, not subscribed`,
    best: `top ${t.bestTopPercent}% by spend, or subscribed ${t.bestSubscribedMonths}+ months`,
  })[key];

export interface Thresholds {
  readonly lapsedMonths: number;
  readonly atRiskMisses: number;
  readonly atRiskDays: number;
  readonly dormantFromDays: number;
  readonly dormantToDays: number;
  readonly bestTopPercent: number;
  readonly bestSubscribedMonths: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  lapsedMonths: 12,
  atRiskMisses: 2,
  atRiskDays: 90,
  dormantFromDays: 90,
  dormantToDays: 180,
  bestTopPercent: 10,
  bestSubscribedMonths: 12,
};

/** Each threshold's allowed range: whole numbers, inclusive. */
const RANGES: Record<keyof Thresholds, readonly [number, number]> = {
  lapsedMonths: [1, 36],
  atRiskMisses: [1, 12],
  atRiskDays: [7, 365],
  dormantFromDays: [30, 730],
  dormantToDays: [31, 1095],
  bestTopPercent: [1, 50],
  bestSubscribedMonths: [1, 60],
};

/**
 * The settings record's `segment_thresholds` JSON, over the defaults. A
 * missing key keeps its default; a bad one is reported and keeps its
 * default too, so one typo never empties a segment.
 */
export const parseThresholds = (
  json: string | null | undefined,
): { thresholds: Thresholds; problems: string[] } => {
  if (!json) return { thresholds: DEFAULT_THRESHOLDS, problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {
      thresholds: DEFAULT_THRESHOLDS,
      problems: ["segment_thresholds isn't JSON"],
    };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return {
      thresholds: DEFAULT_THRESHOLDS,
      problems: ["segment_thresholds isn't an object"],
    };
  const problems: string[] = [];
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in RANGES)) {
      problems.push(`${key}: not a threshold`);
      continue;
    }
    const [min, max] = RANGES[key as keyof Thresholds];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      problems.push(`${key}: a whole number from ${min} to ${max}`);
      continue;
    }
    thresholds[key as keyof Thresholds] = value;
  }
  if (thresholds.dormantToDays <= thresholds.dormantFromDays) {
    problems.push("dormantToDays must be after dormantFromDays");
    thresholds.dormantFromDays = DEFAULT_THRESHOLDS.dormantFromDays;
    thresholds.dormantToDays = DEFAULT_THRESHOLDS.dormantToDays;
  }
  return { thresholds, problems };
};

/** A Recharge subscription, in any status. */
export interface SegmentSubscription {
  readonly customerId: number;
  readonly status: string;
  readonly createdAt: string | null;
  readonly cancelledAt: string | null;
}

/** A Recharge charge that was skipped or failed. */
export interface MissedCharge {
  readonly customerId: number;
  readonly scheduledAt: string | null;
}

/** A Shopify customer who has ordered. */
export interface SegmentCustomer {
  readonly id: string;
  readonly orders: number;
  readonly amountSpent: number;
  readonly lastOrderAt: string | null;
}

export interface SegmentInputs {
  readonly subscriptions: readonly SegmentSubscription[];
  readonly missed: readonly MissedCharge[];
  readonly customers: readonly SegmentCustomer[];
  /** Recharge customer id → Shopify customer GID. */
  readonly shopifyIdOf: ReadonlyMap<number, string>;
}

export interface Segments {
  readonly members: Record<SegmentKey, string[]>;
  /** Recharge customers with no Shopify customer: left out of every segment. */
  readonly unmatched: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Recharge times come without a zone; they're UTC. */
const time = (value: string | null): number => {
  if (!value) return Number.NaN;
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).getTime();
};

const monthsBefore = (now: Date, months: number): Date => {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
};

export const segmentMembers = (
  inputs: SegmentInputs,
  t: Thresholds,
  now: Date,
): Segments => {
  const { subscriptions, missed, customers, shopifyIdOf } = inputs;
  const rechargeIds = new Set(subscriptions.map((s) => s.customerId));
  const unmatched = [...rechargeIds].filter((id) => !shopifyIdOf.has(id)).length;
  const toShopify = (ids: Iterable<number>): string[] =>
    [...new Set([...ids].flatMap((id) => shopifyIdOf.get(id) ?? []))].sort();

  const active = subscriptions.filter((s) => s.status.toLowerCase() === "active");
  const activeIds = new Set(active.map((s) => s.customerId));

  const lapsed = lapsedCustomers(
    subscriptions
      .filter((s) => s.status.toLowerCase() === "cancelled")
      .map((s) => ({ customerId: s.customerId, cancelledAt: s.cancelledAt })),
    activeIds,
    monthsBefore(now, t.lapsedMonths),
  );

  const missedSince = now.getTime() - t.atRiskDays * DAY;
  const misses = new Map<number, number>();
  for (const charge of missed) {
    const at = time(charge.scheduledAt);
    if (!(at >= missedSince && at <= now.getTime())) continue;
    misses.set(charge.customerId, (misses.get(charge.customerId) ?? 0) + 1);
  }
  const atRisk = [...misses]
    .filter(([id, count]) => count >= t.atRiskMisses && activeIds.has(id))
    .map(([id]) => id);

  // Anyone Recharge has ever seen has subscribed; active subscribers by GID.
  const everSubscribed = new Set(toShopify(rechargeIds));
  const subscribed = new Set(toShopify(activeIds));
  const buyers = customers.filter((c) => c.orders > 0);

  const oneTime = buyers.filter((c) => !everSubscribed.has(c.id)).map((c) => c.id);

  const dormantFrom = now.getTime() - t.dormantToDays * DAY;
  const dormantTo = now.getTime() - t.dormantFromDays * DAY;
  const dormant = buyers
    .filter((c) => {
      const at = time(c.lastOrderAt);
      return at >= dormantFrom && at <= dormantTo && !subscribed.has(c.id);
    })
    .map((c) => c.id);

  // Top spenders: the given share of buyers, at least one when anyone has spent.
  const bySpend = buyers.filter((c) => c.amountSpent > 0);
  bySpend.sort((a, b) => b.amountSpent - a.amountSpent);
  const topCount = Math.ceil((bySpend.length * t.bestTopPercent) / 100);
  const cutoff = bySpend[topCount - 1]?.amountSpent ?? Number.POSITIVE_INFINITY;
  const topSpenders = bySpend.filter((c) => c.amountSpent >= cutoff).map((c) => c.id);
  const loyalSince = monthsBefore(now, t.bestSubscribedMonths).getTime();
  const loyal = active
    .filter((s) => time(s.createdAt) <= loyalSince)
    .map((s) => s.customerId);

  return {
    members: {
      active: [...subscribed].sort(),
      lapsed: toShopify(lapsed),
      at_risk: toShopify(atRisk),
      one_time: [...new Set(oneTime)].sort(),
      dormant: [...new Set(dormant)].sort(),
      best: [...new Set([...topSpenders, ...toShopify(loyal)])].sort(),
    },
    unmatched,
  };
};

/** The tag the discount Function reads (`audienceTags`). */
export const segmentTag = (key: SegmentKey): string => `segment:${key}`;

/** Who a sync would tag and untag, from members and who has the tag now. */
export const tagPlan = (
  members: readonly string[],
  tagged: readonly string[],
): { add: string[]; remove: string[] } => {
  const want = new Set(members);
  const have = new Set(tagged);
  return {
    add: members.filter((id) => !have.has(id)),
    remove: tagged.filter((id) => !want.has(id)),
  };
};

/**
 * Whether a tag sync looks safe to run unattended: it refuses to take a tag
 * off more than half of a segment's current members (and more than a few),
 * since that usually means a read failed, not that half the segment left.
 * Run by hand with `--force-tags` once the numbers are checked.
 */
export const tagSyncProblem = (
  key: SegmentKey,
  plan: { add: readonly string[]; remove: readonly string[] },
  tagged: number,
): string | null =>
  plan.remove.length > 10 && plan.remove.length > tagged / 2
    ? `${segmentTag(key)}: would remove ${plan.remove.length} of ${tagged} tags`
    : null;

/** The counts snapshot the calendar shows, stored on the settings record. */
export interface SegmentCounts {
  readonly syncedAt: string;
  readonly counts: Record<SegmentKey, number>;
}

export const segmentCounts = (segments: Segments, now: Date): SegmentCounts => ({
  syncedAt: now.toISOString(),
  counts: Object.fromEntries(
    SEGMENT_KEYS.map((key) => [key, segments.members[key].length]),
  ) as Record<SegmentKey, number>,
});

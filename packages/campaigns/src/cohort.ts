import { isCampaignOrder, type ReportOrder } from "./report";

/**
 * Did a campaign's buyers come back? (SHO-169) The customers whose orders
 * counted for the campaign, followed for 30, 60 and 90 days after it ended:
 * how many ordered again (a Recharge renewal counts: it's an order), how
 * many have a subscription, and how many haven't been back. A sale that only
 * gave margin away to people who'd have bought anyway shows up here.
 * Guests can't be followed; they're counted apart.
 */

export interface CohortWindow {
  readonly days: number;
  /** Ordered again within `days` of the end. */
  readonly returned: number;
  /** Has a subscription: one bought in the campaign, or since, within `days`. */
  readonly subscribed: number;
}

export interface Cohort {
  readonly buyers: number;
  readonly guests: number;
  /** How many were new customers (their campaign order was their first). */
  readonly firstTime: number;
  readonly windows: readonly CohortWindow[];
  /** How far the data reaches: windows past it aren't complete yet. */
  readonly daysSoFar: number;
}

const DAY = 24 * 60 * 60 * 1000;

export const cohort = (
  orders: readonly ReportOrder[],
  campaign: {
    readonly handle: string;
    readonly discountTitles: readonly string[];
    readonly startsAt: Date;
    readonly endsAt: Date;
  },
  now: Date,
  windows: readonly number[] = [30, 60, 90],
): Cohort => {
  const inCampaign = orders.filter(
    (order) =>
      new Date(order.createdAt) >= campaign.startsAt &&
      new Date(order.createdAt) < campaign.endsAt &&
      isCampaignOrder(order, campaign),
  );
  const buyers = new Map<string, { first: boolean; subscribed: boolean }>();
  for (const order of inCampaign) {
    if (!order.customerId) continue;
    const known = buyers.get(order.customerId);
    buyers.set(order.customerId, {
      first:
        (known?.first ?? false) ||
        (order.customerOrders !== null && order.customerOrders <= 1),
      subscribed:
        (known?.subscribed ?? false) || order.lines.some((line) => line.subscription),
    });
  }
  const after = orders.filter(
    (order) =>
      order.customerId &&
      buyers.has(order.customerId) &&
      new Date(order.createdAt) >= campaign.endsAt,
  );
  return {
    buyers: buyers.size,
    guests: inCampaign.filter((order) => !order.customerId).length,
    firstTime: [...buyers.values()].filter((b) => b.first).length,
    daysSoFar: Math.max(0, Math.floor((now.getTime() - campaign.endsAt.getTime()) / DAY)),
    windows: windows.map((days) => {
      const until = campaign.endsAt.getTime() + days * DAY;
      const within = after.filter((order) => new Date(order.createdAt).getTime() < until);
      const returned = new Set(within.map((order) => order.customerId!));
      const subscribed = new Set([
        ...[...buyers].filter(([, b]) => b.subscribed).map(([id]) => id),
        ...within
          .filter((o) => o.lines.some((l) => l.subscription))
          .map((o) => o.customerId!),
      ]);
      return { days, returned: returned.size, subscribed: subscribed.size };
    }),
  };
};

export const cohortMarkdown = (title: string, result: Cohort): string => {
  const pct = (n: number) =>
    result.buyers ? `${Math.round((n / result.buyers) * 100)}%` : "—";
  return [
    `# ${title}: did buyers come back?`,
    "",
    `${result.buyers} signed-in buyers (${result.firstTime} new customers); ${result.guests} guest orders can't be followed. ${result.daysSoFar} days since the end.`,
    "",
    "| Days after | Ordered again | Subscribed | Not back yet |",
    "| ---------- | ------------- | ---------- | ------------ |",
    ...result.windows.map(
      (w) =>
        `| ${w.days}${w.days > result.daysSoFar ? " (so far)" : ""} | ${w.returned} (${pct(w.returned)}) | ${w.subscribed} (${pct(w.subscribed)}) | ${result.buyers - w.returned} (${pct(result.buyers - w.returned)}) |`,
    ),
  ].join("\n");
};

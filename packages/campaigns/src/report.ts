import { formatMoney } from "@formulate/shopify";

/** An order as `campaigns report` reads it. */
export interface ReportOrder {
  readonly name: string;
  readonly createdAt: string;
  readonly subtotal: number;
  readonly currencyCode: string;
  /** Titles and codes of the discounts applied. */
  readonly discounts: readonly string[];
  /** What the campaign's discount took off this order. */
  readonly campaignDiscount: number;
  readonly attributes: Readonly<Record<string, string>>;
  /** Shopify's channel, e.g. "web" (Online Store) or the headless app's id. */
  readonly sourceName: string | null;
  readonly utmSource: string | null;
  readonly utmCampaign: string | null;
  /**
   * Whether this was the customer's first order (their earliest, so a later
   * order doesn't change it); null for a guest order.
   */
  readonly firstOrder: boolean | null;
  /** The signed-in customer, for tagging who's had a campaign; null for a guest. */
  readonly customerId?: string | null;
  readonly lines: readonly {
    readonly title: string;
    readonly quantity: number;
    readonly subscription: boolean;
  }[];
}

export interface CampaignReport {
  readonly orders: number;
  readonly revenue: number;
  readonly discountCost: number;
  readonly currencyCode: string;
  readonly bySurface: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<string, number>>;
  readonly firstOrders: number;
  readonly subscriptionsStarted: number;
  readonly topProducts: readonly { readonly title: string; readonly quantity: number }[];
  /** Orders per UK hour ("2026-11-27 09"), oldest first, for the dashboard. */
  readonly byHour: readonly { readonly hour: string; readonly orders: number }[];
}

/** "2026-11-27 09": the order's hour in UK time. */
const ukHour = (iso: string): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}`;
};

/**
 * Whether an order belongs to the campaign: its discount was applied, or the
 * cart was tagged `_campaign` (a visit to the campaign page, SHO-169), so a
 * tiered offer's near miss still counts.
 */
export const isCampaignOrder = (
  order: ReportOrder,
  campaign: { readonly handle: string; readonly discountTitles: readonly string[] },
): boolean =>
  order.attributes._campaign === campaign.handle ||
  order.discounts.some((discount) => campaign.discountTitles.includes(discount));

const tally = (values: readonly string[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
};

/**
 * The surface an order came from: `_surface` when the cart carries it
 * (web, app), else the theme when Shopify says Online Store.
 */
const surface = (order: ReportOrder): string =>
  order.attributes._surface ??
  (order.sourceName === "web" ? "theme" : (order.sourceName ?? "unknown"));

/** What a campaign did, from its orders. */
export const campaignReport = (
  orders: readonly ReportOrder[],
  campaign: { readonly handle: string; readonly discountTitles: readonly string[] },
): CampaignReport => {
  const ours = orders.filter((order) => isCampaignOrder(order, campaign));
  const products = new Map<string, number>();
  for (const line of ours.flatMap((order) => order.lines))
    products.set(line.title, (products.get(line.title) ?? 0) + line.quantity);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    orders: ours.length,
    revenue: round(ours.reduce((sum, order) => sum + order.subtotal, 0)),
    discountCost: round(ours.reduce((sum, order) => sum + order.campaignDiscount, 0)),
    currencyCode: ours[0]?.currencyCode ?? "GBP",
    bySurface: tally(ours.map(surface)),
    bySource: tally(
      ours.map((order) =>
        order.utmSource
          ? `${order.utmSource}${order.utmCampaign ? ` / ${order.utmCampaign}` : ""}`
          : "direct or unknown",
      ),
    ),
    firstOrders: ours.filter((order) => order.firstOrder === true).length,
    subscriptionsStarted: ours.reduce(
      (sum, order) => sum + order.lines.filter((line) => line.subscription).length,
      0,
    ),
    topProducts: [...products]
      .map(([title, quantity]) => ({ title, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.title.localeCompare(b.title))
      .slice(0, 5),
    byHour: Object.entries(tally(ours.map((order) => ukHour(order.createdAt))))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, orders]) => ({ hour, orders })),
  };
};

export const reportMarkdown = (title: string, report: CampaignReport): string => {
  const money = (amount: number) =>
    formatMoney({ amount: amount.toFixed(2), currencyCode: report.currencyCode });
  const table = (counts: Readonly<Record<string, number>>) =>
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([key, count]) => `| ${key} | ${count} |`);
  return [
    `# ${title}: results`,
    "",
    `- **Orders:** ${report.orders}`,
    `- **Revenue** (subtotal after discounts): ${money(report.revenue)}`,
    `- **Discount cost:** ${money(report.discountCost)}`,
    `- **Average order:** ${report.orders ? money(report.revenue / report.orders) : "—"}`,
    `- **First orders** (new customers): ${report.firstOrders}`,
    `- **Subscriptions started:** ${report.subscriptionsStarted}`,
    "",
    "| Surface | Orders |",
    "| ------- | ------ |",
    ...table(report.bySurface),
    "",
    "| Source (UTM) | Orders |",
    "| ------------ | ------ |",
    ...table(report.bySource),
    "",
    "| Top products | Units |",
    "| ------------ | ----- |",
    ...report.topProducts.map((product) => `| ${product.title} | ${product.quantity} |`),
  ].join("\n");
};

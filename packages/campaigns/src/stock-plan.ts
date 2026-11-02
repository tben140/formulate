import type { ProductInfo } from "./types";

/**
 * Stock against the plan (SHO-209): will each product last the campaign?
 *
 * The forecast is deliberately simple and says so: the product's recent
 * daily sales (units over the last `baselineDays`), times the campaign's
 * length, times an uplift for the offer. The uplift is the last comparable
 * campaign's when there is one (`campaignUplift`), otherwise 3×: a common
 * rule of thumb for a strong seasonal sale, to be replaced by this shop's
 * own history once it has some. Untracked stock is never short.
 */

export const DEFAULT_UPLIFT = 3;
export const BASELINE_DAYS = 28;

export interface StockLine {
  readonly product: string;
  /** Units on hand across tracked variants; null when none are tracked. */
  readonly stock: number | null;
  readonly perDay: number;
  /** Units the campaign is likely to sell, rounded up. */
  readonly expected: number;
  readonly short: boolean;
}

export const campaignDays = (startsAt: Date, endsAt: Date): number =>
  Math.max(1 / 24, (endsAt.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000));

/** Units sold per product title, from order lines. */
export const unitsByProduct = (
  lines: readonly { readonly title: string; readonly quantity: number }[],
): Map<string, number> => {
  const units = new Map<string, number>();
  for (const line of lines)
    units.set(line.title, (units.get(line.title) ?? 0) + line.quantity);
  return units;
};

/**
 * The uplift a past campaign showed: its daily units over the baseline's,
 * across the products both sold. Null without enough to go on.
 */
export const campaignUplift = (
  during: ReadonlyMap<string, number>,
  duringDays: number,
  baseline: ReadonlyMap<string, number>,
  baselineDays: number,
): number | null => {
  let campaign = 0;
  let usual = 0;
  for (const [title, units] of during) {
    const before = baseline.get(title);
    if (!before) continue;
    campaign += units / duringDays;
    usual += before / baselineDays;
  }
  return usual > 0 && campaign > 0 ? Math.round((campaign / usual) * 10) / 10 : null;
};

export const stockPlan = (
  products: readonly ProductInfo[],
  recent: ReadonlyMap<string, number>,
  options: {
    readonly days: number;
    readonly uplift?: number;
    readonly baselineDays?: number;
  },
): StockLine[] => {
  const uplift = options.uplift ?? DEFAULT_UPLIFT;
  const baselineDays = options.baselineDays ?? BASELINE_DAYS;
  return products
    .map((product) => {
      const tracked = product.variants.filter((v) => typeof v.stock === "number");
      const stock = tracked.length
        ? tracked.reduce((sum, v) => sum + (v.stock ?? 0), 0)
        : null;
      const perDay = (recent.get(product.title) ?? 0) / baselineDays;
      const expected = Math.ceil(perDay * options.days * uplift);
      return {
        product: product.title,
        stock,
        perDay: Math.round(perDay * 100) / 100,
        expected,
        short: stock !== null && expected > stock,
      };
    })
    .sort((a, b) => Number(b.short) - Number(a.short) || b.expected - a.expected);
};

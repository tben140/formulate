/**
 * Price history, for an honest "Normally £x" (UK pricing rules: a reference
 * price must be one the product was genuinely sold at, for a reasonable time,
 * recently; the CMA's guidance on the DMCC Act 2024 treats a price raised just
 * before a sale as misleading). Shopify keeps no price history, so
 * `campaigns prices record` keeps one: each variant's price changes, in an
 * app-owned metafield, read back by `campaigns check`.
 *
 * Stored as change points, oldest first: [["2026-10-01", "9.95"], ...]. A
 * day's entry is that day's price from then on. Kept to KEEP_DAYS, plus the
 * last change before the window, so the price at the window's start is known.
 */

export type PriceChange = readonly [day: string, price: string];

/** A history covers this many days before a campaign. */
export const REFERENCE_DAYS = 28;
const KEEP_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;

/** The UK date of an instant: prices change on UK days. */
export const ukDay = (at: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(at);

const dayBefore = (day: string, days: number): string =>
  ukDay(new Date(new Date(`${day}T12:00:00Z`).getTime() - days * DAY));

/** The metafield's value, or an empty history for anything unreadable. */
export const parseHistory = (value: string | null | undefined): PriceChange[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PriceChange =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(entry[0])) &&
        /^\d+(\.\d{1,2})?$/.test(String(entry[1])),
    );
  } catch {
    return [];
  }
};

/**
 * The history with today's price recorded, or null when nothing changed (no
 * write needed). Trims what's older than KEEP_DAYS, keeping the change in
 * force at the window's start.
 */
export const recordPrice = (
  history: readonly PriceChange[],
  price: string,
  today: string,
): PriceChange[] | null => {
  const last = history.at(-1);
  if (last && Number(last[1]) === Number(price)) return null;
  const next = [...history.filter(([day]) => day < today), [today, price] as PriceChange];
  const cutoff = dayBefore(today, KEEP_DAYS);
  const firstInside = next.findIndex(([day]) => day >= cutoff);
  return firstInside > 0 ? next.slice(firstInside - 1) : next;
};

/** The price in force on `day`, or null before the history starts. */
export const priceOn = (history: readonly PriceChange[], day: string): string | null => {
  let price: string | null = null;
  for (const [changed, value] of history) {
    if (changed > day) break;
    price = value;
  }
  return price;
};

export type ReferenceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no-history"; readonly since: string | null }
  | {
      readonly ok: false;
      readonly reason: "raised";
      /** The lower price, and the day it was last in force. */
      readonly lower: string;
      readonly on: string;
    };

/**
 * Whether `price` is an honest "normally" price for a campaign starting at
 * `startsAt`: in force for every one of the REFERENCE_DAYS days before, by the
 * recorded history. A price raised in that window fails; so does a history
 * too short to tell (recording started after the window opened).
 */
export const checkReferencePrice = (
  history: readonly PriceChange[],
  price: string,
  startsAt: Date,
): ReferenceCheck => {
  const start = ukDay(startsAt);
  const from = dayBefore(start, REFERENCE_DAYS);
  const first = history[0];
  if (!first || first[0] > from)
    return { ok: false, reason: "no-history", since: first?.[0] ?? null };
  // Every price in force across the window: the one at its start, and changes in it.
  const inWindow: PriceChange[] = [
    [from, priceOn(history, from) ?? first[1]],
    ...history.filter(([day]) => day > from && day < start),
  ];
  const lower = [...inWindow]
    .reverse()
    .find(([, value]) => Number(value) < Number(price));
  if (lower) return { ok: false, reason: "raised", lower: lower[1], on: lower[0] };
  return { ok: true };
};

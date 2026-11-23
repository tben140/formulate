import { isSelected, type FilterLike, type FilterValueLike } from "./filters";
import type { ProductCollectionSortKeys } from "./generated/graphql";

/**
 * How a collection listing is sorted and which of its filters are worth
 * showing, shared by apps/web and apps/mobile. apps/theme does the same in
 * Liquid (snippets/collection-filters.liquid).
 */

/** The query-string parameter for the sort, as Liquid themes name it. */
export const SORT_PARAM = "sort_by";

export type SortOption = {
  /** The `sort_by` value, as Liquid writes it; "" is the merchant's order. */
  readonly value: string;
  readonly label: string;
  readonly sortKey: ProductCollectionSortKeys;
  readonly reverse: boolean;
};

/**
 * The sorts a shopper can choose. "Featured" is the merchant's own order for
 * the collection (COLLECTION_DEFAULT), and the default. No "Best selling": in
 * this demo store there are no real sales to rank by.
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { value: "", label: "Featured", sortKey: "COLLECTION_DEFAULT", reverse: false },
  {
    value: "price-ascending",
    label: "Price, low to high",
    sortKey: "PRICE",
    reverse: false,
  },
  {
    value: "price-descending",
    label: "Price, high to low",
    sortKey: "PRICE",
    reverse: true,
  },
  { value: "created-descending", label: "Newest", sortKey: "CREATED", reverse: true },
];

const DEFAULT_SORT = SORT_OPTIONS[0] as SortOption;

/** The sort a query string asks for; anything unknown is the default. */
export const collectionSort = (params: URLSearchParams): SortOption =>
  SORT_OPTIONS.find((option) => option.value === (params.get(SORT_PARAM) ?? "")) ??
  DEFAULT_SORT;

/** The query string with a sort chosen; the default leaves no parameter. */
export const withSort = (params: URLSearchParams, value: string): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const name of ["page", "after", "before"]) next.delete(name);
  if (value && SORT_OPTIONS.some((option) => option.value === value))
    next.set(SORT_PARAM, value);
  else next.delete(SORT_PARAM);
  return next;
};

/** How many values a group lists before "Show more". */
export const FILTER_VALUES_SHOWN = 5;

/** How many groups start open, in the order Search & Discovery lists them. */
export const FILTER_GROUPS_OPEN = 3;

export type FilterGroup = {
  readonly filter: FilterLike;
  /** The values worth offering: see `filterGroups`. */
  readonly values: readonly FilterValueLike[];
  /** Whether the group starts open. */
  readonly open: boolean;
  /** Whether its "Show more" starts open: a selection is hidden there. */
  readonly moreOpen: boolean;
  readonly selected: number;
};

/**
 * The filter groups worth showing for a listing, and how each starts.
 *
 * - A value is left out when choosing it would change nothing: it matches
 *   every product listed (`total`), or none. So is "Out of stock". One that's
 *   selected always stays, so it can be cleared. `total` is null when the listing has more products
 *   than one page holds, since then the count isn't known.
 * - A group with no values left is left out. The price range stays while
 *   prices differ.
 * - The first FILTER_GROUPS_OPEN groups start open, in the merchant's order
 *   from Search & Discovery, and so does any group with a selection.
 */
export const filterGroups = (
  filters: readonly FilterLike[],
  params: URLSearchParams,
  total: number | null,
): FilterGroup[] => {
  const groups: Omit<FilterGroup, "open">[] = [];
  for (const filter of filters) {
    if (filter.type === "PRICE_RANGE") {
      const bounds = priceBounds(filter);
      const set = params.has(`${filter.id}.gte`) || params.has(`${filter.id}.lte`);
      if (set || !bounds || bounds.max > bounds.min)
        groups.push({ filter, values: [], moreOpen: false, selected: set ? 1 : 0 });
      continue;
    }
    const values = filter.values.filter(
      (value) =>
        isSelected(params, filter, value) ||
        (value.count > 0 &&
          (total === null || value.count < total) &&
          !isOutOfStock(value)),
    );
    if (values.length === 0) continue;
    const selected = values.filter((value) => isSelected(params, filter, value));
    const moreOpen = values
      .slice(FILTER_VALUES_SHOWN)
      .some((value) => isSelected(params, filter, value));
    groups.push({ filter, values, moreOpen, selected: selected.length });
  }
  return groups.map((group, index) => ({
    ...group,
    open: index < FILTER_GROUPS_OPEN || group.selected > 0,
  }));
};

/**
 * Availability's "Out of stock" value: nobody shops for what they can't buy,
 * so it's never offered, only kept when a shared link already selects it.
 */
const isOutOfStock = (value: FilterValueLike): boolean => {
  try {
    const input = (
      typeof value.input === "string" ? JSON.parse(value.input) : value.input
    ) as { available?: unknown } | null;
    return input?.available === false;
  } catch {
    return false;
  }
};

/** The price range Shopify reports for a listing, from the filter's input. */
export const priceBounds = (filter: FilterLike): { min: number; max: number } | null => {
  const input = filter.values[0]?.input;
  try {
    const parsed = (typeof input === "string" ? JSON.parse(input) : (input ?? null)) as {
      price?: { min?: number; max?: number };
    } | null;
    const { min, max } = parsed?.price ?? {};
    return typeof min === "number" && typeof max === "number" ? { min, max } : null;
  } catch {
    return null;
  }
};

/** "£0 – £33": the listing's price range in whole pounds, for a hint. */
export const priceRangeLabel = (filter: FilterLike): string | null => {
  const bounds = priceBounds(filter);
  return bounds ? `£${Math.floor(bounds.min)} – £${Math.ceil(bounds.max)}` : null;
};

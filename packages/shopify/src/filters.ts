import type { ProductFilter } from "./generated/graphql";

/**
 * Collection and search filtering, as Shopify's Search & Discovery app
 * configures it, expressed as URL state.
 *
 * The URL format is the one Liquid themes use (`?filter.v.availability=1`,
 * `?filter.v.price.gte=10`, `?filter.v.option.flavour=Vanilla`,
 * `?filter.p.m.double_helix.format=Capsule`), so a filtered link means the same
 * thing on apps/theme and on the headless surfaces. Which filters exist is
 * decided in the Search & Discovery app, not in code.
 *
 * Two directions:
 *
 * - **URL → API**: `productFiltersFromParams` turns the query string into the
 *   Storefront API's `ProductFilter` inputs. It works from the parameter names
 *   alone, so a page can query once, without first asking which filters exist.
 *   When the available filters are known, a matching value's own `input` is
 *   used instead, which is exact (option names, metafield value types).
 * - **UI → URL**: `isSelected`, `withValueToggled`, `withPriceRange` and
 *   `withoutFilters` build the next query string from a click.
 *
 * Anything that isn't a filter parameter is left alone, and an unrecognised
 * `filter.*` parameter is ignored rather than sent: the API would reject it.
 *
 * ⚠️ The API silently ignores a filter type that isn't switched on in Search &
 * Discovery: no error, just unfiltered results. Measured 2026-10-01 on
 * `performance`, where only Availability and Price were configured: price
 * ranges narrowed 6 products to 2, while `filter.p.tag` and
 * `filter.v.option.flavour` still returned all 6. If a filter "does nothing",
 * check the app's Filters page before the code.
 */

/** A filter as the Storefront API returns it (see `FilterFields`). */
export type FilterLike = {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly values: readonly FilterValueLike[];
};

export type FilterValueLike = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  /** The `ProductFilter` this value applies, as a JSON string. */
  readonly input: unknown;
};

const PREFIX = "filter.";
const PRICE_TYPE = "PRICE_RANGE";

const parseInput = (input: unknown): ProductFilter | null => {
  if (typeof input === "object" && input !== null) return input as ProductFilter;
  if (typeof input !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ProductFilter)
      : null;
  } catch {
    return null;
  }
};

const toAmount = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

/**
 * The query-string value that selects `value` of `filter`: the part of the
 * value's id after the filter's id. `filter.v.availability.1` → `1`, as in
 * Liquid's `?filter.v.availability=1`.
 */
export const paramValue = (filter: FilterLike, value: FilterValueLike): string =>
  value.id.startsWith(`${filter.id}.`) ? value.id.slice(filter.id.length + 1) : value.id;

const matches = (
  selected: string,
  filter: FilterLike,
  value: FilterValueLike,
): boolean => {
  const own = paramValue(filter, value);
  return (
    selected === own ||
    selected.toLowerCase() === own.toLowerCase() ||
    selected.toLowerCase() === value.label.toLowerCase()
  );
};

/** One `filter.*` parameter, from its name alone, following Shopify's scheme. */
const fromParam = (name: string, value: string): ProductFilter | null => {
  const path = name.slice(PREFIX.length);

  if (path === "v.availability") {
    if (value === "1") return { available: true };
    if (value === "0") return { available: false };
    return null;
  }
  if (path.startsWith("v.option.")) {
    const option = path.slice("v.option.".length);
    return option ? { variantOption: { name: option, value } } : null;
  }
  if (path === "p.product_type") return { productType: value };
  if (path === "p.vendor") return { productVendor: value };
  if (path === "p.tag") return { tag: value };

  const metafield = /^(p|v)\.m\.([^.]+)\.(.+)$/.exec(path);
  if (metafield) {
    const [, owner, namespace, key] = metafield;
    if (!namespace || !key) return null;
    return owner === "p"
      ? { productMetafield: { namespace, key, value } }
      : { variantMetafield: { namespace, key, value } };
  }
  return null;
};

/**
 * The Storefront API filters a query string asks for.
 *
 * @param available The filters the API offered for this listing, when known.
 *   A selected value found there is sent as that value's own `input`.
 */
export const productFiltersFromParams = (
  params: URLSearchParams,
  available: readonly FilterLike[] = [],
): ProductFilter[] => {
  const filters: ProductFilter[] = [];

  // Price is a range across two parameters, whatever the filter's id.
  const priceId =
    available.find((filter) => filter.type === PRICE_TYPE)?.id ?? "filter.v.price";
  const min = toAmount(params.get(`${priceId}.gte`));
  const max = toAmount(params.get(`${priceId}.lte`));
  if (min !== null || max !== null) {
    filters.push({
      price: { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) },
    });
  }

  for (const [name, raw] of params) {
    if (!name.startsWith(PREFIX) || name.startsWith(`${priceId}.`)) continue;
    const value = raw.trim();
    if (!value) continue;

    const filter = available.find((candidate) => candidate.id === name);
    const known = filter?.values.find((candidate) => matches(value, filter, candidate));
    const input = known ? parseInput(known.input) : fromParam(name, value);
    if (input) filters.push(input);
  }

  return filters;
};

/** Whether `value` of `filter` is selected in this query string. */
export const isSelected = (
  params: URLSearchParams,
  filter: FilterLike,
  value: FilterValueLike,
): boolean =>
  params.getAll(filter.id).some((selected) => matches(selected, filter, value));

/** A paginated listing must restart from the first page when filters change. */
const withoutPaging = (params: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const name of ["page", "after", "before"]) next.delete(name);
  return next;
};

/** The query string with `value` of `filter` switched on or off. */
export const withValueToggled = (
  params: URLSearchParams,
  filter: FilterLike,
  value: FilterValueLike,
): URLSearchParams => {
  const next = withoutPaging(params);
  const own = paramValue(filter, value);
  const kept = next
    .getAll(filter.id)
    .filter((selected) => !matches(selected, filter, value));
  next.delete(filter.id);
  for (const selected of kept) next.append(filter.id, selected);
  if (!isSelected(params, filter, value)) next.append(filter.id, own);
  return next;
};

/** The query string with a price range set; `null` clears that end. */
export const withPriceRange = (
  params: URLSearchParams,
  filter: FilterLike,
  min: number | null,
  max: number | null,
): URLSearchParams => {
  const next = withoutPaging(params);
  next.delete(`${filter.id}.gte`);
  next.delete(`${filter.id}.lte`);
  if (min !== null && min > 0) next.set(`${filter.id}.gte`, String(min));
  if (max !== null) next.set(`${filter.id}.lte`, String(max));
  return next;
};

/** The query string with every filter removed, everything else kept. */
export const withoutFilters = (params: URLSearchParams): URLSearchParams => {
  const next = withoutPaging(params);
  for (const name of [...next.keys()]) if (name.startsWith(PREFIX)) next.delete(name);
  return next;
};

/** How many filter values (and price bounds) the query string selects. */
export const activeFilterCount = (params: URLSearchParams): number =>
  [...params.keys()].filter((name) => name.startsWith(PREFIX)).length;

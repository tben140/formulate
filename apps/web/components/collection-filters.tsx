import {
  activeFilterCount,
  collectionSort,
  filterGroups,
  FILTER_VALUES_SHOWN,
  isSelected,
  paramValue,
  priceRangeLabel,
  SORT_OPTIONS,
  SORT_PARAM,
  withoutFilters,
  withPriceRange,
  withValueToggled,
  type FilterGroup,
  type FilterLike,
  type FilterValueLike,
} from "@formulate/shopify";
import Link from "next/link";
import type { ReactNode } from "react";

import { AutoSubmitForm, WithJs, WithoutJs } from "@/components/auto-submit-form";

/**
 * A product listing with its Search & Discovery filters (SHO-153), for a
 * collection or search results: the filters, a results count, a sort, the
 * active filters as removable chips, and the products (`children`).
 *
 * - From `lg` up the filters are a sidebar beside the products. Below that a
 *   Filter button opens them as a full-screen sheet with a "Show N products"
 *   button. The sheet is the sidebar itself, shown by `#filters:target`, so it
 *   opens and closes without JavaScript, and Back closes it.
 * - Groups collapse (<details>). The first few start open, in the order set in
 *   Search & Discovery, and long ones show five values and "Show more".
 *   Values that would change nothing are left out (`filterGroups`).
 * - With JavaScript, a change applies at once (AutoSubmitForm). Without it,
 *   the panel is a GET form with an Apply button, producing the Liquid-style
 *   query string (`?filter.v.option.flavour=Vanilla&sort_by=price-ascending`)
 *   that the page and apps/theme read. Every state is a shareable URL.
 */
export const FilteredListing = ({
  filters,
  params,
  path,
  productCount,
  total,
  sortable = false,
  children,
}: {
  readonly filters: readonly FilterLike[];
  /** The page's current query string. */
  readonly params: URLSearchParams;
  /** The listing's path, which the forms submit to. */
  readonly path: string;
  /** How many products are listed. */
  readonly productCount: number;
  /** How many products match in all, or null when that isn't known. */
  readonly total: number | null;
  /** Offer a sort (collections; search sorts by relevance). */
  readonly sortable?: boolean;
  readonly children: ReactNode;
}) => {
  const groups = filterGroups(filters, params, total);
  const active = activeFilterCount(params);
  const href = (next: URLSearchParams) => (next.size ? `${path}?${next}` : path);
  const clearHref = href(withoutFilters(params));
  const hasPanel = groups.length > 0 || active > 0;
  const count = `${productCount} ${productCount === 1 ? "product" : "products"}`;

  const chips = filters.flatMap((filter) =>
    filter.type === "PRICE_RANGE"
      ? priceChip(filter, params, href)
      : filter.values
          .filter((value) => isSelected(params, filter, value))
          .map((value) => ({
            key: value.id,
            label: `${filter.label}: ${value.label}`,
            href: href(withValueToggled(params, filter, value)),
          })),
  );

  return (
    <div
      className={
        hasPanel
          ? "lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8"
          : undefined
      }
    >
      {hasPanel ? (
        <aside
          id="filters"
          aria-label="Filters"
          className="bg-surface max-lg:hidden max-lg:target:fixed max-lg:target:inset-0 max-lg:target:z-50 max-lg:target:flex max-lg:target:flex-col lg:sticky lg:top-6"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-4 lg:hidden">
            <h2 className="text-lg font-semibold">Filter</h2>
            <a
              href="#results"
              className="text-brand-600 underline-offset-4 hover:underline"
            >
              Close
            </a>
          </div>
          <AutoSubmitForm action={path} className="flex min-h-0 flex-1 flex-col">
            {/* Anything else in the URL (the sort) survives a filter change. */}
            {[...withoutFilters(params)].map(([name, value], index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
            ))}
            <div className="flex-1 overflow-y-auto px-4 lg:overflow-visible lg:px-0">
              {groups.map((group) => (
                <FilterGroupView key={group.filter.id} group={group} params={params} />
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:border-0 lg:px-0 lg:pb-0">
              <WithoutJs>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700 lg:flex-none"
                >
                  Apply
                </button>
              </WithoutJs>
              <WithJs>
                {/* Changes have applied already; this only closes the sheet. */}
                <a
                  href="#results"
                  className="flex-1 rounded-md bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-surface hover:bg-brand-700 lg:hidden"
                >
                  Show {count}
                </a>
              </WithJs>
              {active > 0 ? (
                <Link
                  href={clearHref}
                  className="text-sm text-brand-600 underline underline-offset-4"
                >
                  Clear all
                </Link>
              ) : null}
            </div>
          </AutoSubmitForm>
        </aside>
      ) : null}

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          {hasPanel ? (
            <a
              href="#filters"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-400 lg:hidden"
            >
              Filter
              {active > 0 ? (
                <span className="rounded-full bg-brand-600 px-2 text-xs text-surface">
                  {active}
                  <span className="sr-only"> active</span>
                </span>
              ) : null}
            </a>
          ) : null}
          {/* Announced as filters apply in place (AutoSubmitForm). */}
          <p aria-live="polite" className="text-sm text-foreground-muted">
            {count}
          </p>
          {sortable ? <SortControl params={params} path={path} /> : null}
        </div>

        {chips.length > 0 ? (
          <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.href}
                  scroll={false}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm hover:border-brand-400"
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">, remove filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={clearHref}
                scroll={false}
                className="inline-flex px-2 py-1 text-sm text-brand-600 underline underline-offset-4"
              >
                Clear all
              </Link>
            </li>
          </ul>
        ) : null}

        {/* Where the sheet's Close and "Show N products" land. */}
        <div id="results" className="scroll-mt-4">
          {children}
        </div>
      </div>
    </div>
  );
};

const FilterGroupView = ({
  group,
  params,
}: {
  readonly group: FilterGroup;
  readonly params: URLSearchParams;
}) => {
  const { filter, values } = group;
  const shown = values.slice(0, FILTER_VALUES_SHOWN);
  const more = values.slice(FILTER_VALUES_SHOWN);
  const value = (item: FilterValueLike) => (
    <li key={item.id}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={filter.id}
          value={paramValue(filter, item)}
          defaultChecked={isSelected(params, filter, item)}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="min-w-0">{item.label}</span>
        <span className="text-foreground-muted">({item.count})</span>
      </label>
    </li>
  );

  return (
    <details open={group.open} className="group/filter border-b border-border py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          {filter.label}
          {group.selected > 0 ? (
            <span className="ml-2 rounded-full bg-brand-600 px-1.5 text-xs font-medium text-surface">
              {group.selected}
              <span className="sr-only"> selected</span>
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className="text-foreground-muted transition-transform group-open/filter:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      {filter.type === "PRICE_RANGE" ? (
        <PriceFields filter={filter} params={params} />
      ) : (
        <fieldset className="mt-3">
          <legend className="sr-only">{filter.label}</legend>
          <ul className="space-y-2">{shown.map(value)}</ul>
          {more.length > 0 ? (
            <details open={group.moreOpen} className="group/more mt-2">
              <summary className="cursor-pointer list-none text-sm text-brand-600 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                <span className="group-open/more:hidden">Show {more.length} more</span>
                <span className="hidden group-open/more:inline">Show fewer</span>
              </summary>
              <ul className="mt-2 space-y-2">{more.map(value)}</ul>
            </details>
          ) : null}
        </fieldset>
      )}
    </details>
  );
};

const PriceFields = ({
  filter,
  params,
}: {
  readonly filter: FilterLike;
  readonly params: URLSearchParams;
}) => {
  const range = priceRangeLabel(filter);
  const field = (end: "gte" | "lte", label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <span className="flex items-center gap-1">
        <span aria-hidden="true">£</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          name={`${filter.id}.${end}`}
          defaultValue={params.get(`${filter.id}.${end}`) ?? ""}
          className="w-20 rounded-md border border-border px-2 py-1"
        />
      </span>
    </label>
  );
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">{filter.label}</legend>
      {/* The range as a hint, not a placeholder that looks like an entry. */}
      {range ? <p className="mb-2 text-xs text-foreground-muted">Range {range}</p> : null}
      <div className="flex gap-3">
        {field("gte", "From")}
        {field("lte", "To")}
      </div>
    </fieldset>
  );
};

const SortControl = ({
  params,
  path,
}: {
  readonly params: URLSearchParams;
  readonly path: string;
}) => (
  <AutoSubmitForm action={path} className="ml-auto flex items-center gap-2 text-sm">
    {[...params]
      .filter(([name]) => name !== SORT_PARAM)
      .map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
    <label htmlFor="sort" className="text-foreground-muted">
      Sort
    </label>
    <select
      id="sort"
      name={SORT_PARAM}
      defaultValue={collectionSort(params).value}
      className="rounded-md border border-border bg-surface px-2 py-1.5"
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <WithoutJs>
      <button
        type="submit"
        className="rounded-md border border-border px-3 py-1.5 font-medium hover:border-brand-400"
      >
        Sort
      </button>
    </WithoutJs>
  </AutoSubmitForm>
);

const priceChip = (
  filter: FilterLike,
  params: URLSearchParams,
  href: (next: URLSearchParams) => string,
) => {
  const min = params.get(`${filter.id}.gte`);
  const max = params.get(`${filter.id}.lte`);
  if (!min && !max) return [];
  const label = min && max ? `£${min} – £${max}` : min ? `From £${min}` : `Up to £${max}`;
  return [
    {
      key: filter.id,
      label: `${filter.label}: ${label}`,
      href: href(withPriceRange(params, filter, null, null)),
    },
  ];
};

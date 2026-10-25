import {
  activeFilterCount,
  isSelected,
  paramValue,
  withoutFilters,
  withPriceRange,
  withValueToggled,
  type FilterLike,
} from "@formulate/shopify";
import Link from "next/link";

/**
 * Filters for a listing, as configured in Search & Discovery (SHO-153).
 *
 * No client JavaScript. The panel is a <details> holding a GET <form>, so
 * submitting it produces exactly the Liquid-style query string
 * (`?filter.v.option.flavour=Vanilla&filter.v.price.lte=20`) that the page
 * reads with `productFiltersFromParams`, and that apps/theme reads too. Every
 * filtered page is a plain, shareable URL that works before hydration.
 *
 * An Apply button rather than filtering on every change: changing context the
 * moment a checkbox is ticked is disorienting for screen reader and keyboard
 * users (WCAG 3.2.2), and each change would be a full page request.
 */
export const CollectionFilters = ({
  filters,
  params,
  path,
  productCount,
}: {
  readonly filters: readonly FilterLike[];
  /** The page's current query string. */
  readonly params: URLSearchParams;
  /** The listing's path, which the form submits to. */
  readonly path: string;
  readonly productCount: number;
}) => {
  if (filters.length === 0) return null;

  const active = activeFilterCount(params);
  const href = (next: URLSearchParams) => (next.size ? `${path}?${next}` : path);
  const kept = [...withoutFilters(params)];

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
    <div className="mb-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <details className="group w-full sm:w-auto">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-400 [&::-webkit-details-marker]:hidden">
            Filter
            {active > 0 ? (
              <span className="rounded-full bg-brand-600 px-2 text-xs text-surface">
                {active}
                <span className="sr-only"> active</span>
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>

          <form
            method="get"
            action={path}
            className="mt-3 grid gap-6 rounded-lg border border-border p-4 sm:min-w-[32rem] sm:grid-cols-2"
          >
            {/* Anything else in the URL (a sort, later) survives a filter change. */}
            {kept.map(([name, value], index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
            ))}

            {filters.map((filter) =>
              filter.type === "PRICE_RANGE" ? (
                <PriceFields key={filter.id} filter={filter} params={params} />
              ) : (
                <fieldset key={filter.id}>
                  <legend className="mb-2 text-sm font-semibold">{filter.label}</legend>
                  <ul className="space-y-1.5">
                    {filter.values.map((value) => {
                      const checked = isSelected(params, filter, value);
                      return (
                        <li key={value.id}>
                          <label
                            className={`flex items-center gap-2 text-sm ${
                              value.count === 0 && !checked ? "text-foreground-muted" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              name={filter.id}
                              value={paramValue(filter, value)}
                              defaultChecked={checked}
                              // Nothing to find, unless it's already on: then
                              // it must stay un-tickable.
                              disabled={value.count === 0 && !checked}
                              className="h-4 w-4 accent-brand-600"
                            />
                            {value.label}
                            <span className="text-foreground-muted">({value.count})</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ),
            )}

            <div className="flex items-center gap-4 sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700"
              >
                Apply
              </button>
              {active > 0 ? (
                <Link
                  href={href(withoutFilters(params))}
                  className="text-sm text-brand-600 underline underline-offset-4"
                >
                  Clear all
                </Link>
              ) : null}
            </div>
          </form>
        </details>

        <p className="py-2 text-sm text-foreground-muted">
          {productCount} {productCount === 1 ? "product" : "products"}
        </p>
      </div>

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.href}
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
              href={href(withoutFilters(params))}
              className="inline-flex px-2 py-1 text-sm text-brand-600 underline underline-offset-4"
            >
              Clear all
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
};

/** The range Shopify reports for this listing, from the filter's input. */
const priceBounds = (filter: FilterLike): { min: number; max: number } | null => {
  const input = filter.values[0]?.input;
  try {
    const parsed = JSON.parse(typeof input === "string" ? input : "null") as {
      price?: { min?: number; max?: number };
    } | null;
    const { min, max } = parsed?.price ?? {};
    return typeof min === "number" && typeof max === "number" ? { min, max } : null;
  } catch {
    return null;
  }
};

const PriceFields = ({
  filter,
  params,
}: {
  readonly filter: FilterLike;
  readonly params: URLSearchParams;
}) => {
  const bounds = priceBounds(filter);
  const field = (end: "gte" | "lte", label: string, placeholder: number | undefined) => (
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
          placeholder={placeholder === undefined ? undefined : String(placeholder)}
          className="w-24 rounded-md border border-border px-2 py-1"
        />
      </span>
    </label>
  );
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{filter.label}</legend>
      <div className="flex gap-4">
        {field("gte", "From", bounds?.min)}
        {field("lte", "To", bounds?.max)}
      </div>
    </fieldset>
  );
};

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

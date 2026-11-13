/**
 * Next's `searchParams` prop as a URLSearchParams, keeping repeated keys
 * (`?filter.v.option.flavour=Vanilla&filter.v.option.flavour=Citrus`) in order.
 */
export const toSearchParams = (
  record: Record<string, string | string[] | undefined>,
): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value]) {
      params.append(key, item);
    }
  }
  return params;
};

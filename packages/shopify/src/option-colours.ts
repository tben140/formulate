/**
 * Swatch colours for option values Shopify can't give a swatch.
 *
 * Shopify only fills `ProductOptionValue.swatch` for options linked to its
 * Colour category metafield, so a Flavour option never gets one. The colours
 * live instead in one shop metafield, `double_helix.option_colours`: a JSON
 * object of option name to value name to colour, e.g.
 * `{"Flavour": {"Vanilla": "#F3E5AB"}}`. Names match whatever the case.
 *
 * apps/web and apps/mobile fill the product's missing swatches from it
 * (`withOptionColours`), so their pickers need no change; apps/theme does the
 * same in Liquid (snippets/option-colour.liquid). A swatch set in the admin
 * always wins.
 */

/** Option name, then value name, both lower case, to a CSS hex colour. */
export type OptionColours = ReadonlyMap<string, ReadonlyMap<string, string>>;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The colours in the metafield's value. Anything malformed (bad JSON, a value
 * that isn't a hex colour) is skipped rather than failing the product page.
 */
export const optionColours = (value: string | null | undefined): OptionColours => {
  const colours = new Map<string, Map<string, string>>();
  if (!value) return colours;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return colours;
  }
  if (!isRecord(parsed)) return colours;
  for (const [option, values] of Object.entries(parsed)) {
    if (!isRecord(values)) continue;
    const byValue = new Map<string, string>();
    for (const [name, colour] of Object.entries(values))
      if (typeof colour === "string" && HEX.test(colour.trim()))
        byValue.set(name.trim().toLowerCase(), colour.trim());
    if (byValue.size > 0) colours.set(option.trim().toLowerCase(), byValue);
  }
  return colours;
};

/** The colour for one option value, or null. */
export const optionColour = (
  colours: OptionColours,
  option: string,
  value: string,
): string | null =>
  colours.get(option.trim().toLowerCase())?.get(value.trim().toLowerCase()) ?? null;

type Swatch = { color: string | null; image: unknown };
type ProductWithOptions = {
  options: ReadonlyArray<{
    name: string;
    optionValues: ReadonlyArray<{ name: string; swatch: Swatch | null }>;
  }>;
};

/**
 * The product with a colour swatch on each option value that has none and a
 * colour in `colours`. Values with a swatch from the admin keep it.
 */
export const withOptionColours = <P extends ProductWithOptions>(
  product: P,
  colours: OptionColours,
): P => {
  if (colours.size === 0) return product;
  return {
    ...product,
    options: product.options.map((option) => ({
      ...option,
      optionValues: option.optionValues.map((value) => {
        if (value.swatch) return value;
        const color = optionColour(colours, option.name, value.name);
        return color ? { ...value, swatch: { color, image: null } } : value;
      }),
    })),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

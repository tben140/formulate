/**
 * The collection the storefront opens on.
 *
 * `automated-collection` is a seeded smart collection on the demo store
 * (products priced between £200 and £800), which gives the slice eight real
 * products to render.
 */
export const DEFAULT_COLLECTION_HANDLE = "automated-collection";

/**
 * Must match the schema version codegen ran against — see codegen.ts. Bumping
 * one without the other is how generated types silently drift from reality.
 */
export const DEFAULT_API_VERSION = "2026-04";

/**
 * The buyer country applied when a cart is created.
 *
 * This is load-bearing, and it was found empirically rather than read in the
 * docs. A cart created with no buyer context produces a Shopify checkout that
 * defaults Country/Region to the **United States** — on a store whose currency
 * is GBP and whose address is in the United Kingdom. Every buyer would land on
 * a US address form with a US state dropdown.
 *
 * The Storefront API resolves country from context, and absent any context it
 * does NOT inherit the shop's own country.
 *
 * Three sources were considered:
 *
 *   1. The shop's own country  ← chosen
 *   2. Device or browser locale
 *   3. An explicit market selector shown to the buyer
 *
 * (2) is wrong here: locale describes the language someone reads, not where
 * they want a parcel delivered, and a UK store served to a browser set to
 * en-US would silently switch currency. (3) is the right answer for a genuine
 * multi-market store and the wrong amount of UI for a single-market one.
 *
 * So this is deliberately a constant rather than a lookup — one documented
 * decision, applied identically by all surfaces, which is what SHO-98 asked
 * for. When markets arrive, this becomes the fallback rather than the answer.
 */
export const DEFAULT_COUNTRY_CODE = "GB" as const;

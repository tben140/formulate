import type { MoneyLike } from "./format-money";

/**
 * Search as you type (SHO-103): the rules all three surfaces share, so a
 * shopper typing the same thing sees suggestions at the same moment
 * everywhere.
 *
 * - `minLength`: two characters, as the app's live search already used. One
 *   letter matches almost everything and tells the shopper nothing.
 * - `debounceMs`: wait for a pause in typing, not every keystroke. Long enough
 *   to skip the letters of a word typed quickly, short enough to feel live.
 * - `limit`: a short list to choose from. Anything more is what the full
 *   search page is for.
 *
 * The Liquid theme can't import this; `assets/predictive-search.js` repeats the
 * values with a pointer back here. Change both together.
 */
export const PREDICTIVE_SEARCH = {
  minLength: 2,
  debounceMs: 200,
  limit: 6,
} as const;

/** The term to suggest for, or null when it's too short to be worth a request. */
export const suggestionTerm = (input: string): string | null => {
  const term = input.trim();
  return term.length >= PREDICTIVE_SEARCH.minLength ? term : null;
};

/** One product suggestion: enough to recognise it and go straight to it. */
export interface ProductSuggestion {
  readonly handle: string;
  readonly title: string;
  readonly price: MoneyLike | null;
  readonly imageUrl: string | null;
}

interface PredictiveProductLike {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange?: { readonly minVariantPrice: MoneyLike } | null;
}

/**
 * Suggestions from the Storefront API's `predictiveSearch` products, trimmed
 * to the shared limit. Structural, so it doesn't depend on generated types.
 */
export const toProductSuggestions = (
  products: readonly PredictiveProductLike[] | null | undefined,
): readonly ProductSuggestion[] =>
  (products ?? []).slice(0, PREDICTIVE_SEARCH.limit).map((product) => ({
    handle: product.handle,
    title: product.title,
    price: product.priceRange?.minVariantPrice ?? null,
    imageUrl: product.featuredImage?.url ?? null,
  }));

/** The announcement for a screen reader once suggestions arrive. */
export const suggestionsStatus = (count: number): string =>
  count === 0
    ? "No suggestions. Press Enter to search."
    : `${count} ${count === 1 ? "suggestion" : "suggestions"}. Use the up and down arrows to choose.`;

"use client";

import {
  formatMoney,
  PREDICTIVE_SEARCH,
  suggestionsStatus,
  suggestionTerm,
  type ProductSuggestion,
} from "@formulate/shopify";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

/**
 * The search box, with product suggestions as you type (SHO-103), matching the
 * theme's <predictive-search> and the app's live search.
 *
 * The WAI-ARIA "list autocomplete" combobox: the input keeps focus, the
 * highlighted option is announced through `aria-activedescendant`, and a
 * status line says how many suggestions there are. Arrow keys move, Enter on a
 * highlighted suggestion opens that product, Escape closes the list (then
 * clears the box). Enter with nothing highlighted submits the form as before,
 * to the full results page, and without JavaScript this is that plain input.
 */
export const PredictiveSearch = ({
  id,
  defaultValue,
}: {
  readonly id: string;
  readonly defaultValue: string;
}) => {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  // Each result remembers the term it was fetched for. The list only shows
  // while that is still the term in the box, so a stale list never offers
  // suggestions for a word that isn't there any more.
  const [result, setResult] = useState<{
    readonly term: string;
    readonly products: readonly ProductSuggestion[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");

  const term = suggestionTerm(value);
  // The results page's own term needs no suggestions: they're on the page.
  const wanted = term && term !== defaultValue.trim() ? term : null;
  const suggestions = result && result.term === wanted ? result.products : [];

  useEffect(() => {
    if (!wanted) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/search/suggest?q=${encodeURIComponent(wanted)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { products?: ProductSuggestion[] };
        const products = body.products ?? [];
        setResult({ term: wanted, products });
        setActive(-1);
        setOpen(true);
        setStatus(suggestionsStatus(products.length));
      } catch (error) {
        // Aborted by the next keystroke, or offline: Enter still searches.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult(null);
          setOpen(false);
        }
      }
    }, PREDICTIVE_SEARCH.debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [wanted]);

  const go = (suggestion: ProductSuggestion) => {
    setOpen(false);
    router.push(`/products/${encodeURIComponent(suggestion.handle)}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (count === 0) return;
        event.preventDefault();
        setOpen(true);
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + count) % count);
        return;
      }
      case "Enter": {
        const chosen = open ? suggestions[active] : undefined;
        if (chosen) {
          event.preventDefault();
          go(chosen);
        }
        return;
      }
      case "Escape": {
        if (open) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (value) {
          setValue("");
        }
        return;
      }
    }
  };

  const showList = open && suggestions.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    // Not `relative`: the list is placed against the whole form (button
    // included), so a product name has room at phone width.
    <div className="min-w-0 flex-1">
      <input
        id={id}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search products"
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        className="w-full rounded-md border border-ink-400 px-3 py-2"
      />

      <ul
        id={listId}
        role="listbox"
        aria-label="Suggested products"
        hidden={!showList}
        className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
      >
        {suggestions.map((suggestion, index) => (
          // Keyboard users choose with the input's arrows and Enter
          // (aria-activedescendant); options never take focus, so the click
          // is for pointer and touch only.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={suggestion.handle}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // mousedown, not click: blur would close the list before a click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => go(suggestion)}
            onMouseEnter={() => setActive(index)}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
              index === active ? "bg-brand-50" : ""
            }`}
          >
            {suggestion.imageUrl ? (
              <Image
                src={suggestion.imageUrl}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                className="h-10 w-10 shrink-0 rounded bg-surface-muted object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded bg-surface-muted"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-foreground">
              {suggestion.title}
            </span>
            {suggestion.price ? (
              // Full-strength text: brand-50 under muted grey fails AA (#77).
              <span className="shrink-0 font-mono text-foreground">
                {formatMoney(suggestion.price)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
};

/**
 * Applies a listing's filters and sort as they change
 * (snippets/collection-filters.liquid), the theme's version of apps/web's
 * AutoSubmitForm. Without this file the forms submit as plain GETs.
 *
 * A change fetches the section through the Section Rendering API and swaps
 * in the parts that change: the filter groups and their counts, the totals,
 * the chips, the forms' hidden fields and the products. The sidebar element
 * itself stays, so the phone sheet (`#filters:target`) stays open, and so do
 * any groups the shopper opened. Focus returns to the control they used. If
 * the fetch fails, it falls back to loading the page.
 */
(() => {
  // Once per page, however many listings render this script.
  if (document.documentElement.classList.contains("listing-js")) return;
  document.documentElement.classList.add("listing-js");

  /** @param {Element} from @param {Element} to @param {string} selector */
  const swap = (from, to, selector) => {
    const current = from.querySelector(selector);
    const next = to.querySelector(selector);
    if (current && next) current.replaceWith(next);
    else if (current) current.remove();
    return { current, next };
  };

  /** @param {HTMLFormElement} form */
  const apply = async (form) => {
    const listing = form.closest("[data-listing]");
    if (!listing) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim() !== "") params.append(name, value);
    }
    const url = new URL(form.action, location.href);
    url.search = params.toString();

    const focused = document.activeElement;
    const focusKey =
      focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement
        ? `[name="${CSS.escape(focused.name)}"]${focused instanceof HTMLInputElement && focused.type === "checkbox" ? `[value="${CSS.escape(focused.value)}"]` : ""}`
        : null;
    const opened = new Map(
      [...listing.querySelectorAll("details[data-group]")].map((group) => [
        group.getAttribute("data-group"),
        group.hasAttribute("open"),
      ]),
    );

    listing.setAttribute("aria-busy", "true");
    try {
      const request = new URL(url);
      request.searchParams.set(
        "section_id",
        listing.getAttribute("data-section-id") ?? "",
      );
      const response = await fetch(request);
      if (!response.ok) throw new Error(String(response.status));
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const next = doc.querySelector("[data-listing]");
      if (!next) throw new Error("no listing");

      swap(listing, next, "[data-listing-groups]");
      swap(listing, next, ".listing__actions");
      swap(listing, next, ".listing__toggle");
      swap(listing, next, "[data-listing-results]");
      const total = listing.querySelector("[data-listing-total]");
      const nextTotal = next.querySelector("[data-listing-total]");
      if (total && nextTotal) total.textContent = nextTotal.textContent;

      const chips = next.querySelector(".listing__chips");
      listing.querySelector(".listing__chips")?.remove();
      if (chips) listing.querySelector("[data-listing-results]")?.before(chips);

      // Each form's hidden fields carry the other form's state.
      const forms = listing.querySelectorAll("[data-listing-form]");
      const nextForms = next.querySelectorAll("[data-listing-form]");
      forms.forEach((own, index) => {
        const fresh = nextForms[index];
        if (!fresh) return;
        own
          .querySelectorAll(':scope > input[type="hidden"]')
          .forEach((input) => input.remove());
        own.prepend(...fresh.querySelectorAll(':scope > input[type="hidden"]'));
      });

      listing.querySelectorAll("details[data-group]").forEach((group) => {
        const was = opened.get(group.getAttribute("data-group"));
        if (was !== undefined)
          group.toggleAttribute("open", was || group.hasAttribute("open"));
      });
      history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
      if (focusKey)
        /** @type {HTMLElement | null} */ (listing.querySelector(focusKey))?.focus();
    } catch {
      location.assign(url);
    } finally {
      listing.removeAttribute("aria-busy");
    }
  };

  document.addEventListener("change", (event) => {
    const form =
      event.target instanceof Element
        ? event.target.closest("[data-listing-form]")
        : null;
    if (form instanceof HTMLFormElement) apply(form);
  });
  document.addEventListener("submit", (event) => {
    const form =
      event.target instanceof Element
        ? event.target.closest("[data-listing-form]")
        : null;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    apply(form);
  });
})();

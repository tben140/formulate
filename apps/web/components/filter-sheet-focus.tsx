"use client";

import { useEffect } from "react";

/** Tailwind's `lg`: from here up the filters are a sidebar, not a sheet. */
const SIDEBAR_QUERY = "(min-width: 64rem)";

/**
 * Makes the phone filter sheet (`#filters:target`, see FilteredListing)
 * behave as a modal once JavaScript runs:
 *
 * - everything outside the sheet is inert, so Tab and a screen reader can't
 *   reach the page it covers (WCAG 2.4.11);
 * - focus moves into the sheet when it opens, and back to the Filter button
 *   when it closes;
 * - Escape closes it, as Close does (`#results`).
 *
 * The sheet itself stays a `:target` panel, so it still opens and closes
 * without JavaScript, and the desktop sidebar is never modal.
 */
export const FilterSheetFocus = ({
  sheetId,
  openerId,
  closeHash,
}: {
  readonly sheetId: string;
  readonly openerId: string;
  readonly closeHash: string;
}) => {
  useEffect(() => {
    const sidebar = window.matchMedia(SIDEBAR_QUERY);
    let inerted: HTMLElement[] = [];
    let open = false;

    const release = () => {
      for (const element of inerted) element.inert = false;
      inerted = [];
    };

    const sync = () => {
      const sheet = document.getElementById(sheetId);
      const shouldOpen =
        !!sheet && window.location.hash === `#${sheetId}` && !sidebar.matches;
      if (shouldOpen === open) return;
      open = shouldOpen;
      release();
      if (!sheet) return;
      if (open) {
        // Every sibling of the sheet and of each of its ancestors.
        for (
          let node: HTMLElement = sheet;
          node.parentElement;
          node = node.parentElement
        ) {
          for (const sibling of node.parentElement.children) {
            if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
              sibling.inert = true;
              inerted.push(sibling);
            }
          }
        }
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.querySelector<HTMLElement>("a, button, input, select, summary")?.focus();
      } else {
        sheet.removeAttribute("role");
        sheet.removeAttribute("aria-modal");
        if (
          sheet.contains(document.activeElement) ||
          document.activeElement === document.body
        ) {
          document.getElementById(openerId)?.focus({ preventScroll: true });
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (open && event.key === "Escape") window.location.hash = closeHash;
    };

    sync();
    window.addEventListener("hashchange", sync);
    sidebar.addEventListener("change", sync);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("hashchange", sync);
      sidebar.removeEventListener("change", sync);
      document.removeEventListener("keydown", onKeyDown);
      release();
    };
  }, [sheetId, openerId, closeHash]);

  return null;
};

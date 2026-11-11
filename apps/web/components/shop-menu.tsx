"use client";

import type { NavGroup } from "@formulate/shopify";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/**
 * The header's Shop button and the panel it opens: a column per menu in
 * SHOP_MENU_HANDLES (by goal, by product family, by format), so the bar itself
 * can stay short however many collections the store has.
 *
 * A disclosure, not an ARIA menu: a button with `aria-expanded` that shows a
 * panel of ordinary links, which Tab walks through. Escape closes it and puts
 * focus back on the button; so do a click outside and a new page.
 *
 * The panel is absolutely placed against the header (which is `relative`), so
 * it spans the header's full width.
 */
export const ShopMenu = ({ groups }: { groups: readonly NavGroup[] }) => {
  const pathname = usePathname();
  // The page it was opened on: a new page closes it without an effect, since
  // the shopper chose a link.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || panel.current?.contains(target)) return;
      setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const current = groups.some((group) =>
    group.links.some((link) => link.path === pathname),
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline ${
          open || current ? "font-medium text-foreground" : "text-foreground-muted"
        }`}
      >
        Shop
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        ref={panel}
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-surface whitespace-normal shadow-sm"
      >
        <div className="mx-auto grid max-w-5xl gap-x-8 gap-y-6 px-4 py-6 sm:grid-cols-3">
          {groups.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2 className="text-xs font-semibold tracking-wide text-foreground uppercase">
                {group.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => {
                  const here = pathname === link.path;
                  return (
                    <li key={link.id}>
                      <Link
                        href={link.path}
                        aria-current={here ? "page" : undefined}
                        // Closes on the same page too, where the path doesn't change.
                        onClick={() => setOpen(false)}
                        className={`underline-offset-4 hover:text-foreground hover:underline ${
                          here
                            ? "font-medium text-foreground underline"
                            : "text-foreground-muted"
                        }`}
                      >
                        {link.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
};

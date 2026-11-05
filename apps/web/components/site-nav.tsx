"use client";

import type { NavLink } from "@formulate/shopify";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The collection links in the header, from the Shopify menu (SHO-60).
 *
 * A client component only to mark the current page: `aria-current="page"`
 * tells a screen reader which link is where they are, and the underline shows
 * it. The links themselves come from the server.
 *
 * Below `md` the list scrolls sideways on its own row rather than wrapping, so
 * the header keeps one predictable height however many collections the
 * merchant adds. The right edge fades out as a cue that there's more, and the
 * current collection is scrolled into view, since it may be past the edge.
 */
export const SiteNav = ({ links }: { links: readonly NavLink[] }) => {
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list.current || !current) return;
    // scrollLeft, not scrollIntoView: that could also scroll the page itself.
    const { offsetLeft, offsetWidth } = current;
    const { scrollLeft, clientWidth } = list.current;
    if (offsetLeft < scrollLeft || offsetLeft + offsetWidth > scrollLeft + clientWidth) {
      list.current.scrollLeft = offsetLeft - (clientWidth - offsetWidth) / 2;
    }
  }, [pathname]);

  if (links.length === 0) return null;

  return (
    <ul
      ref={list}
      aria-label="Collections"
      className="order-3 -mx-4 flex w-full gap-5 overflow-x-auto px-4 pb-1 text-sm whitespace-nowrap md:order-2 md:mx-0 md:w-auto md:flex-1 md:px-0 md:pb-0 max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)]"
    >
      {links.map((link) => {
        const current = pathname === link.path;
        return (
          <li key={link.id}>
            <Link
              href={link.path}
              aria-current={current ? "page" : undefined}
              className={`underline-offset-4 hover:text-foreground hover:underline ${
                current
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
  );
};

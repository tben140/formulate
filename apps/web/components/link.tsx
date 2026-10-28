"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * next/link, prefetching on intent instead of on sight.
 *
 * Next.js prefetches every link that scrolls into view, in production. On a
 * collection page that was about 20 requests per visit, half of everything a
 * page view costs, nearly all for products nobody opens. Vercel's free plan
 * counts each one against a monthly allowance (1,000,000 CDN requests) and
 * pauses the site past it.
 *
 * Here a link prefetches when a mouse or pen rests on it or keyboard focus
 * reaches it: still ahead of the click, for the one link that's about to be
 * used. Touch gets none. A swipe through a product grid starts on a card, and
 * a tap's emulated hover lands just before the click, when Next.js sends its
 * own navigation request rather than waiting, so it would cost two.
 */
export const Link = ({
  href,
  onPointerEnter,
  onFocus,
  ...props
}: ComponentProps<typeof NextLink>) => {
  const router = useRouter();
  const prefetch = () => {
    if (typeof href === "string") router.prefetch(href);
  };
  return (
    <NextLink
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") prefetch();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        prefetch();
        onFocus?.(event);
      }}
    />
  );
};

export { Link as default };

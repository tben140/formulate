"use client";

import { galleryAlt, galleryPosition, type GalleryImage } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The product page's images (matching the theme's <media-gallery> and the
 * app's gallery): one image shows as before; several become a track you can
 * swipe or scroll, snapping to each image, with arrows, thumbnails and a
 * position count.
 *
 * The track is plain CSS scroll snapping, so it swipes on touch and scrolls
 * with a trackpad before (or without) JavaScript. Script adds the arrows,
 * thumbnails and the count, and keeps them in step with wherever the track
 * has been scrolled.
 *
 * Only the first image loads eagerly: it's the page's Largest Contentful
 * Paint (SHO-143). The rest are lazy, so extra images cost nothing until
 * someone looks at them.
 */
export const ProductGallery = ({
  images,
  title,
}: {
  readonly images: readonly GalleryImage[];
  readonly title: string;
}) => {
  const track = useRef<HTMLDivElement>(null);
  // The image an arrow or thumbnail asked for, while the smooth scroll to it
  // runs. Scroll events on the way would otherwise round to the image being
  // left and put the count, the thumbnails and the next arrow press back on it.
  const pending = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const count = images.length;

  // Which image is in view, from the track's scroll position: works for
  // swipes, trackpads, arrows and thumbnails alike.
  useEffect(() => {
    const element = track.current;
    if (!element || count < 2) return;
    const onScroll = () => {
      const index = Math.min(
        Math.max(Math.round(element.scrollLeft / element.clientWidth), 0),
        count - 1,
      );
      if (pending.current !== null) {
        if (index !== pending.current) return;
        pending.current = null;
      }
      setActive(index);
    };
    // The shopper taking over (a swipe, a wheel, arrow keys on the focused
    // track) ends the programmatic scroll's claim.
    const release = () => {
      pending.current = null;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    for (const type of ["pointerdown", "wheel", "touchstart", "keydown"] as const) {
      element.addEventListener(type, release, { passive: true });
    }
    return () => {
      element.removeEventListener("scroll", onScroll);
      for (const type of ["pointerdown", "wheel", "touchstart", "keydown"] as const) {
        element.removeEventListener(type, release);
      }
    };
  }, [count]);

  const show = useCallback(
    (index: number) => {
      const element = track.current;
      if (!element) return;
      const target = (index + count) % count;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      pending.current = target;
      setActive(target);
      element.scrollTo({
        left: target * element.clientWidth,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [count],
  );

  if (count === 0) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-lg border border-border bg-surface-muted text-sm text-foreground-muted"
        aria-hidden="true"
      >
        No image
      </div>
    );
  }

  // The frame takes the first image's shape, which is the page's main photo,
  // so it's never cropped. Later images of another shape fit inside it.
  const [first] = images;
  const ratio =
    first?.width && first.height ? `${first.width} / ${first.height}` : "1 / 1";

  return (
    <section
      aria-roledescription={count > 1 ? "carousel" : undefined}
      aria-label={count > 1 ? `${title} images` : undefined}
      className="min-w-0"
    >
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface-muted">
        <div
          ref={track}
          // Arrow keys scroll a focused track natively; the tabIndex makes it
          // focusable for keyboard users when there's somewhere to scroll.
          tabIndex={count > 1 ? 0 : undefined}
          aria-label={count > 1 ? galleryPosition(active, count) : undefined}
          style={{ aspectRatio: ratio }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => (
            <div
              key={image.url}
              role={count > 1 ? "group" : undefined}
              aria-roledescription={count > 1 ? "slide" : undefined}
              aria-label={count > 1 ? galleryPosition(index, count) : undefined}
              className="h-full w-full shrink-0 snap-center"
            >
              <Image
                data={{ ...image, altText: galleryAlt(image, title, index, count) }}
                sizes="(min-width: 768px) 45vw, 90vw"
                className="h-full w-full object-contain"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            {/* Arrows on wider screens; on touch, the swipe is the control. */}
            {[
              { label: "Previous image", step: -1, side: "left-2", glyph: "‹" },
              { label: "Next image", step: 1, side: "right-2", glyph: "›" },
            ].map(({ label, step, side, glyph }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                onClick={() => show(active + step)}
                className={`absolute top-1/2 ${side} hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/90 text-xl text-foreground shadow-sm hover:bg-surface md:flex`}
              >
                <span aria-hidden="true">{glyph}</span>
              </button>
            ))}
            <p
              aria-live="polite"
              className="absolute right-2 bottom-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-xs text-foreground"
            >
              <span className="sr-only">{galleryPosition(active, count)}</span>
              <span aria-hidden="true">
                {active + 1} / {count}
              </span>
            </p>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div
          role="group"
          aria-label="Choose an image"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              aria-label={`Show ${galleryPosition(index, count).toLowerCase()}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => show(index)}
              className={`shrink-0 overflow-hidden rounded-md border-2 ${
                index === active
                  ? "border-brand-600"
                  : "border-transparent hover:border-border"
              }`}
            >
              <Image
                data={{ ...image, altText: "" }}
                width={64}
                height={64}
                sizes="64px"
                className="h-16 w-16 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

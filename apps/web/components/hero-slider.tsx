"use client";

import { campaignEndsLabel, type HeroSlide } from "@formulate/shopify";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CampaignBadge } from "@/components/campaign-badge";
import { CampaignEnds } from "@/components/campaign-ends";

/** How long each slide shows when it plays by itself. */
const INTERVAL_MS = 7000;

type Image = NonNullable<HeroSlide["image"]>;

/** Shopify's CDN resizes by URL. */
const sized = (url: string, width: number) =>
  `${url}${url.includes("?") ? "&" : "?"}width=${width}`;

/** The phone image on narrow screens, when the slide has one. */
const SlideImage = ({
  image,
  mobile,
  first,
}: {
  readonly image: Image | null;
  readonly mobile: Image | null;
  readonly first: boolean;
}) => {
  const main = image ?? mobile;
  if (!main) return null;
  return (
    <picture className="block overflow-hidden rounded-lg">
      {mobile && image ? (
        <source
          media="(max-width: 767px)"
          srcSet={`${sized(mobile.url, 600)} 600w, ${sized(mobile.url, 900)} 900w`}
          sizes="90vw"
        />
      ) : null}
      <img
        src={sized(main.url, 900)}
        srcSet={`${sized(main.url, 600)} 600w, ${sized(main.url, 900)} 900w, ${sized(main.url, 1200)} 1200w`}
        sizes="(min-width: 768px) 45vw, 90vw"
        alt={main.altText ?? ""}
        width={main.width ?? undefined}
        height={main.height ?? undefined}
        className="h-auto w-full"
        // Only the first slide's image can be the page's LCP.
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "auto"}
      />
    </picture>
  );
};

/**
 * The home page's hero (SHO-203): live campaigns first, then the shop's
 * slides, from `heroSlides`. The theme's home-intro section and the app's
 * HeroPager show the same slides.
 *
 * WCAG 2.2, after the APG carousel pattern:
 * - it plays by itself only without `prefers-reduced-motion`, and stops while
 *   the pointer or keyboard focus is in it, or for good with Pause (2.2.2);
 * - previous, next and a button per slide, all keyboard-operable;
 * - slides out of view are `hidden`, so they're out of the tab order and the
 *   accessibility tree;
 * - the first slide's headline is the page's h1, the others h2.
 *
 * Server-rendered with the first slide showing, so the page works, and its
 * LCP image loads, before any JavaScript.
 */
export const HeroSlider = ({
  slides,
  now,
  clockPreview,
}: {
  readonly slides: readonly HeroSlide[];
  readonly now: number;
  readonly clockPreview: boolean;
}) => {
  const [index, setIndex] = useState(0);
  // null until the visitor chooses: then autoplay follows reduced motion.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [held, setHeld] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const root = useRef<HTMLElement>(null);
  const count = slides.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const autoplay = chosen ?? !reducedMotion;
  const playing = count > 1 && autoplay && !held;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  const go = useCallback((next: number) => setIndex((next + count) % count), [count]);

  return (
    <section
      ref={root}
      aria-labelledby="home-intro"
      aria-roledescription={count > 1 ? "carousel" : undefined}
      className="overflow-hidden rounded-xl bg-brand-50"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      {slides.map((slide, i) => {
        const Heading = i === 0 ? "h1" : "h2";
        return (
          <div
            key={slide.key}
            role={count > 1 ? "group" : undefined}
            aria-roledescription={count > 1 ? "slide" : undefined}
            aria-label={count > 1 ? `${i + 1} of ${count}` : undefined}
            hidden={i !== index}
            className="grid items-center gap-8 px-6 py-12 sm:px-10 md:grid-cols-2"
          >
            <div>
              {slide.campaign ? <CampaignBadge label={slide.campaign.badge} /> : null}
              <Heading
                id={i === 0 ? "home-intro" : undefined}
                className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-balance"
              >
                {slide.headline}
              </Heading>
              {slide.text ? (
                <p className="mt-4 max-w-xl text-lg text-foreground">{slide.text}</p>
              ) : null}
              {slide.campaign ? (
                <p className="mt-2 text-foreground">
                  <CampaignEnds
                    endsAt={slide.campaign.endsAt.toISOString()}
                    label={campaignEndsLabel(slide.campaign)}
                    now={now}
                    clockPreview={clockPreview}
                  />
                </p>
              ) : null}
              {slide.href && slide.buttonLabel ? (
                <Link
                  href={slide.href}
                  className="mt-8 inline-block rounded-md bg-brand-600 px-6 py-3 font-semibold text-surface hover:bg-brand-700"
                >
                  {slide.buttonLabel}
                </Link>
              ) : null}
            </div>
            <SlideImage image={slide.image} mobile={slide.mobileImage} first={i === 0} />
          </div>
        );
      })}

      {count > 1 ? (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-6 sm:px-10">
          <button
            type="button"
            onClick={() => setChosen(!autoplay)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium"
          >
            {autoplay ? "Pause" : "Play"}
            <span className="sr-only"> slides</span>
          </button>
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium"
          >
            Previous<span className="sr-only"> slide</span>
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium"
          >
            Next<span className="sr-only"> slide</span>
          </button>
          <span className="ml-auto flex gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                aria-label={`Show slide ${i + 1}: ${slide.headline}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
                className={`h-3 w-3 rounded-full border border-brand-700 ${i === index ? "bg-brand-700" : "bg-surface"}`}
              />
            ))}
          </span>
        </div>
      ) : null}
    </section>
  );
};

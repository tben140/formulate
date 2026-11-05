import { HeroSlidesQuery, heroSlides, type HeroSlide } from "@formulate/shopify";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { campaignView } from "./campaign";
import { storefront } from "./storefront";

/**
 * The home page's hero slides (SHO-203). The records are cached for a minute;
 * which slides show is worked out per request, against the visitor's view,
 * so campaigns and dated slides come and go on time. A failure means no
 * slides, and the everyday introduction.
 */
const cachedSlideRecords = unstable_cache(
  async () => {
    const result = await storefront.request(HeroSlidesQuery, {});
    if (!result.ok) throw new Error("hero slides unavailable");
    return result.data;
  },
  ["hero-slide-records"],
  { revalidate: 60 },
);

export const getHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  const view = await campaignView();
  try {
    const records = await cachedSlideRecords();
    return heroSlides(records.campaigns.nodes, records.slides.nodes, view);
  } catch {
    return [];
  }
});

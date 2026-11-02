import { HeroSlidesQuery, heroSlides, type HeroSlide } from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";

import { useCampaignView } from "./campaign";
import { storefront } from "./storefront";

/**
 * The home screen's hero slides (SHO-203), from the same records and rule
 * as web. Which slides show is worked out at render against the visitor's
 * view, so campaigns and dated slides come and go on time from a cached
 * query. A failure means no slides, and the everyday introduction.
 */
export const useHeroSlides = (): HeroSlide[] => {
  const view = useCampaignView();
  const { data } = useQuery({
    queryKey: ["hero-slides"],
    queryFn: async () => {
      const result = await storefront.request(HeroSlidesQuery, {});
      return result.ok ? result.data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ? heroSlides(data.campaigns.nodes, data.slides.nodes, view) : [];
};

import {
  BlendIngredientsQuery,
  describeError,
  toBlendIngredients,
} from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";

import { storefront } from "./storefront";

/**
 * The range a daily pack can hold (see packages/shopify/src/blend.ts). Only
 * fetched for a pack; the range changes rarely, so it stays fresh for ten
 * minutes.
 */
export const useBlendIngredients = (enabled: boolean) =>
  useQuery({
    queryKey: ["blend-ingredients"],
    queryFn: async () => {
      const result = await storefront.request(BlendIngredientsQuery, {});
      if (!result.ok) throw new Error(describeError(result.error));
      return toBlendIngredients(result.data.metaobjects.nodes);
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  });

import {
  BlendIngredientsQuery,
  BlendVariantQuery,
  blendAttributes,
  blendSize,
  checkBlend,
  toBlendIngredients,
} from "@formulate/shopify";
import { cache } from "react";

import { storefront } from "./storefront";

/** The range a daily pack can hold. Empty if Shopify didn't answer. */
export const getBlendIngredients = cache(async () => {
  const result = await storefront.request(BlendIngredientsQuery, {});
  return result.ok ? toBlendIngredients(result.data.metaobjects.nodes) : [];
});

/**
 * The cart line attributes for an add, checked on the server: the browser
 * sends only the codes (`blend`), and the label is built here from Shopify's
 * own range. A pack can't be added without a valid blend, and a blend can't
 * ride on anything but a pack of its size.
 */
export const blendLineAttributes = async (
  merchandiseId: string,
  blend: string,
): Promise<
  | { readonly ok: true; readonly attributes: { key: string; value: string }[] | null }
  | { readonly ok: false; readonly message: string }
> => {
  const variant = await storefront.request(BlendVariantQuery, { id: merchandiseId });
  if (!variant.ok)
    return { ok: false, message: "Something went wrong. Please try again." };
  const node = variant.data.node;
  const size = node && "blendSize" in node ? blendSize(node) : null;
  const codes = blend.split(",").filter(Boolean);
  if (size === null) {
    return codes.length === 0
      ? { ok: true, attributes: null }
      : { ok: false, message: "Something went wrong. Please try again." };
  }
  const ingredients = await getBlendIngredients();
  const checked = checkBlend(codes, ingredients, size);
  return checked.ok
    ? { ok: true, attributes: blendAttributes(checked.codes, ingredients) }
    : { ok: false, message: checked.message };
};

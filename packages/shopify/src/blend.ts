/**
 * Custom blends: "Your Daily Pack" (SHO-84 follow-up).
 *
 * One product, priced by size (a variant per number of ingredients, marked by
 * the variant field `double_helix.blend_size`). The shopper's ingredients ride
 * on the cart line as two attributes, which Shopify copies to the order and
 * Recharge to the subscription (verified with order #1011, 29 Oct 2026):
 *
 * - `_blend`: the ingredient codes, e.g. `d3,k2,mg`. Hidden (leading `_`);
 *   what code reads, and what "Edit my blend" rewrites.
 * - `Blend`: the same as words, e.g. `Vitamin D3 + Vitamin K2 + Magnesium`.
 *   Shown at checkout, on the order and to the warehouse.
 *
 * The ingredients are `blend_ingredient` metaobjects, so the range changes in
 * Shopify admin with no deploy. Codes are permanent once sold: a subscription
 * keeps them for as long as it runs.
 *
 * ⚠️ The server builds both attributes from the codes. Never accept the
 * visible label from a browser: it's what the warehouse packs from.
 */

interface FieldValue {
  readonly value?: string | null;
}

/** An ingredient as BlendIngredientFields (queries.ts) selects it. */
export interface BlendIngredientNode {
  readonly handle: string;
  readonly name?: FieldValue | null;
  readonly code?: FieldValue | null;
  readonly amount?: FieldValue | null;
  readonly nrv?: FieldValue | null;
  readonly claim?: FieldValue | null;
  readonly caution?: FieldValue | null;
  readonly vegan?: FieldValue | null;
  readonly sort?: FieldValue | null;
}

export interface BlendIngredient {
  readonly code: string;
  /** "Vitamin D3 (from lichen)". */
  readonly name: string;
  /** "Vitamin D3": the name without its bracketed source, for the label. */
  readonly shortName: string;
  readonly amount: string;
  readonly nrv: string | null;
  readonly claim: string;
  readonly caution: string | null;
  readonly vegan: boolean;
}

export const BLEND_ATTRIBUTES = { codes: "_blend", label: "Blend" } as const;

/** The fewest ingredients a pack can hold. */
export const MIN_BLEND_SIZE = 2;

const text = (field: FieldValue | null | undefined): string | null =>
  field?.value?.trim() || null;

const CODE = /^[a-z0-9]{1,12}$/;

/** The range, in the merchant's order; entries missing a required field are left out. */
export const toBlendIngredients = (
  nodes: readonly (BlendIngredientNode | null | undefined)[],
): BlendIngredient[] =>
  nodes
    .flatMap((node) => {
      const name = text(node?.name);
      const code = text(node?.code);
      const amount = text(node?.amount);
      const claim = text(node?.claim);
      if (!node || !name || !code || !CODE.test(code) || !amount || !claim) return [];
      return [
        {
          sort: Number(text(node.sort) ?? 0),
          ingredient: {
            code,
            name,
            shortName: name.replace(/\s*\(.*\)\s*$/, ""),
            amount,
            nrv: text(node.nrv),
            claim,
            caution: text(node.caution),
            vegan: text(node.vegan) === "true",
          },
        },
      ];
    })
    .sort((a, b) => a.sort - b.sort)
    .map(({ ingredient }) => ingredient);

/** A variant's size, from `double_helix.blend_size`; null if it isn't a pack. */
export const blendSize = (variant: {
  readonly blendSize?: FieldValue | null;
}): number | null => {
  const size = Number(text(variant.blendSize));
  return Number.isInteger(size) && size >= MIN_BLEND_SIZE ? size : null;
};

/** Whether a product is a custom-blend pack: any variant has a size. */
export const isBlendProduct = (product: {
  readonly variants: {
    readonly nodes: readonly { readonly blendSize?: FieldValue | null }[];
  };
}): boolean => product.variants.nodes.some((variant) => blendSize(variant) !== null);

/** The variant holding exactly `count` ingredients, if there is one. */
export const variantForBlend = <V extends { readonly blendSize?: FieldValue | null }>(
  variants: readonly V[],
  count: number,
): V | undefined => variants.find((variant) => blendSize(variant) === count);

/** The largest pack on offer: how many the picker allows. */
export const maxBlendSize = (
  variants: readonly { readonly blendSize?: FieldValue | null }[],
): number => Math.max(0, ...variants.map((variant) => blendSize(variant) ?? 0));

export type BlendCheck =
  | { readonly ok: true; readonly codes: readonly string[] }
  | { readonly ok: false; readonly message: string };

/**
 * Checks a chosen blend against the range and the variant's size, and puts
 * the codes in the range's order, so the same blend is always the same string.
 */
export const checkBlend = (
  codes: readonly string[],
  ingredients: readonly BlendIngredient[],
  size: number | null,
): BlendCheck => {
  const chosen = new Set(codes);
  if (chosen.size !== codes.length)
    return { ok: false, message: "Each ingredient can only be chosen once." };
  if (codes.some((code) => !ingredients.some((ingredient) => ingredient.code === code)))
    return { ok: false, message: "One of those ingredients isn't available any more." };
  if (size === null || codes.length !== size)
    return {
      ok: false,
      message: `Choose ${size ?? MIN_BLEND_SIZE} ingredients for this pack.`,
    };
  return {
    ok: true,
    codes: ingredients
      .map((ingredient) => ingredient.code)
      .filter((code) => chosen.has(code)),
  };
};

/** "Vitamin D3 + Vitamin K2 + Magnesium". */
export const blendLabel = (
  codes: readonly string[],
  ingredients: readonly BlendIngredient[],
): string =>
  codes
    .map(
      (code) =>
        ingredients.find((ingredient) => ingredient.code === code)?.shortName ?? code,
    )
    .join(" + ");

/** The cart line's attributes for a checked blend. */
export const blendAttributes = (
  codes: readonly string[],
  ingredients: readonly BlendIngredient[],
): { key: string; value: string }[] => [
  { key: BLEND_ATTRIBUTES.codes, value: codes.join(",") },
  { key: BLEND_ATTRIBUTES.label, value: blendLabel(codes, ingredients) },
];

/** The codes on a line, order or subscription, from its attributes. */
export const blendCodes = (
  attributes: readonly { readonly key: string; readonly value?: string | null }[],
): string[] =>
  (attributes.find((attribute) => attribute.key === BLEND_ATTRIBUTES.codes)?.value ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => CODE.test(code));

/** Starting points the picker offers. Codes not in the range are skipped. */
export const BLEND_PRESETS: readonly {
  readonly name: string;
  readonly codes: readonly string[];
}[] = [
  { name: "Vegan essentials", codes: ["d3", "dha", "b12", "i"] },
  { name: "Immunity", codes: ["d3", "c", "zn", "se"] },
  { name: "Bones", codes: ["d3", "k2", "mg"] },
  { name: "Energy", codes: ["mg", "b12", "fol"] },
];

/** The presets that can be made from today's range. */
export const availablePresets = (ingredients: readonly BlendIngredient[]) =>
  BLEND_PRESETS.filter((preset) =>
    preset.codes.every((code) =>
      ingredients.some((ingredient) => ingredient.code === code),
    ),
  );

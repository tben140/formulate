import { describe, expect, it } from "vitest";

import {
  availablePresets,
  blendAttributes,
  blendCodes,
  checkBlend,
  isBlendProduct,
  maxBlendSize,
  toBlendIngredients,
  variantForBlend,
  type BlendIngredientNode,
} from "./blend";

const v = (value: string) => ({ value });
const node = (code: string, name: string, sort: number): BlendIngredientNode => ({
  handle: code,
  code: v(code),
  name: v(name),
  amount: v("1 mg"),
  claim: v("A claim."),
  sort: v(String(sort)),
  vegan: v("true"),
});

const range = toBlendIngredients([
  node("mg", "Magnesium (glycinate)", 30),
  node("d3", "Vitamin D3 (from lichen)", 10),
  node("k2", "Vitamin K2 (MK-7)", 20),
  { handle: "broken", name: v("No code") },
  null,
]);

const sizes = [2, 3, 4].map((n) => ({ id: `v${n}`, blendSize: v(String(n)) }));

describe("toBlendIngredients", () => {
  it("keeps complete entries in the merchant's order, with short names", () => {
    expect(range.map((i) => i.code)).toEqual(["d3", "k2", "mg"]);
    expect(range[0]?.shortName).toBe("Vitamin D3");
    expect(range[0]?.vegan).toBe(true);
  });
});

describe("pack sizes", () => {
  it("finds the variant for a count, and the largest size", () => {
    expect(variantForBlend(sizes, 3)?.id).toBe("v3");
    expect(variantForBlend(sizes, 5)).toBeUndefined();
    expect(maxBlendSize(sizes)).toBe(4);
    expect(isBlendProduct({ variants: { nodes: sizes } })).toBe(true);
    expect(isBlendProduct({ variants: { nodes: [{ blendSize: null }] } })).toBe(false);
  });
});

describe("checkBlend", () => {
  it("accepts a blend that fits the pack, in the range's order", () => {
    expect(checkBlend(["mg", "d3"], range, 2)).toEqual({ ok: true, codes: ["d3", "mg"] });
  });

  it("refuses repeats, unknown codes and the wrong count", () => {
    expect(checkBlend(["d3", "d3"], range, 2).ok).toBe(false);
    expect(checkBlend(["d3", "zz"], range, 2).ok).toBe(false);
    expect(checkBlend(["d3", "k2", "mg"], range, 2).ok).toBe(false);
    expect(checkBlend(["d3", "k2"], range, null).ok).toBe(false);
  });
});

describe("attributes", () => {
  it("writes the codes and the readable label", () => {
    expect(blendAttributes(["d3", "k2", "mg"], range)).toEqual([
      { key: "_blend", value: "d3,k2,mg" },
      { key: "Blend", value: "Vitamin D3 + Vitamin K2 + Magnesium" },
    ]);
  });

  it("reads the codes back, ignoring anything malformed", () => {
    expect(blendCodes([{ key: "_blend", value: "d3, k2,BAD!,mg" }])).toEqual([
      "d3",
      "k2",
      "mg",
    ]);
    expect(blendCodes([])).toEqual([]);
  });

  it("offers only presets the range can make", () => {
    expect(availablePresets(range).map((p) => p.name)).toEqual(["Bones"]);
  });
});

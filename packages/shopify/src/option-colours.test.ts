import { describe, expect, it } from "vitest";

import { optionColour, optionColours, withOptionColours } from "./option-colours";

const STORE = JSON.stringify({
  Flavour: { Vanilla: "#F3E5AB", Chocolate: "#6B4226", Unflavoured: "#FFFFFF" },
});

describe("optionColours", () => {
  it("reads colours by option and value, whatever the case", () => {
    const colours = optionColours(STORE);
    expect(optionColour(colours, "Flavour", "Vanilla")).toBe("#F3E5AB");
    expect(optionColour(colours, "flavour", " CHOCOLATE ")).toBe("#6B4226");
    expect(optionColour(colours, "Flavour", "Peach")).toBeNull();
    expect(optionColour(colours, "Sweetening", "Vanilla")).toBeNull();
  });

  it("skips anything that isn't a hex colour, rather than failing", () => {
    const colours = optionColours(
      JSON.stringify({
        Flavour: { Berry: "purple", Citrus: "#F4C430", Peach: 3, Mint: "#abc" },
        Strength: "#000000",
        Sweetening: ["#FFFFFF"],
      }),
    );
    expect(optionColour(colours, "Flavour", "Citrus")).toBe("#F4C430");
    expect(optionColour(colours, "Flavour", "Mint")).toBe("#abc");
    expect(optionColour(colours, "Flavour", "Berry")).toBeNull();
    expect(optionColour(colours, "Flavour", "Peach")).toBeNull();
    expect(colours.has("strength")).toBe(false);
    expect(colours.has("sweetening")).toBe(false);
  });

  it("is empty when the metafield is unset, or isn't an object", () => {
    for (const value of [null, undefined, "", "not json", "[]", '"#FFFFFF"'])
      expect(optionColours(value).size).toBe(0);
  });
});

describe("withOptionColours", () => {
  const product = {
    title: "Whey Protein",
    options: [
      {
        name: "Flavour",
        optionValues: [
          { name: "Vanilla", swatch: null },
          { name: "Chocolate", swatch: { color: "#000000", image: null } },
          { name: "Mango", swatch: null },
        ],
      },
      { name: "Sweetening", optionValues: [{ name: "Sweetened", swatch: null }] },
    ],
  };

  it("gives values without a swatch the shop's colour", () => {
    const [flavour, sweetening] = withOptionColours(product, optionColours(STORE)).options;
    expect(flavour?.optionValues.map((value) => value.swatch)).toEqual([
      { color: "#F3E5AB", image: null },
      // A swatch set in the admin wins.
      { color: "#000000", image: null },
      // No colour for it: stays a pill.
      null,
    ]);
    expect(sweetening?.optionValues[0]?.swatch).toBeNull();
  });

  it("keeps the rest of the product, and returns it as is with no colours", () => {
    expect(withOptionColours(product, optionColours(STORE)).title).toBe("Whey Protein");
    expect(withOptionColours(product, optionColours(null))).toBe(product);
  });
});

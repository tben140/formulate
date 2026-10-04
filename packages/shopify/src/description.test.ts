import { describe, expect, it } from "vitest";

import { descriptionBlocks } from "./description";

describe("descriptionBlocks", () => {
  it("keeps the structure Shopify's plain description loses", () => {
    // From Whey Protein, 2026-10-04 (shortened).
    const html =
      "<p>One tub holds 30 servings.</p><h3>Choose your flavour</h3><p>Three flavours:</p><ul>\n<li>Vanilla</li>\n<li>Chocolate</li>\n</ul><h3>Storage</h3><p>Keep it dry.</p>";
    expect(descriptionBlocks(html)).toEqual([
      { kind: "paragraph", text: "One tub holds 30 servings." },
      { kind: "heading", text: "Choose your flavour" },
      { kind: "paragraph", text: "Three flavours:" },
      { kind: "list", ordered: false, items: ["Vanilla", "Chocolate"] },
      { kind: "heading", text: "Storage" },
      { kind: "paragraph", text: "Keep it dry." },
    ]);
  });

  it("drops inline tags but keeps their text, and turns <br> into a newline", () => {
    expect(
      descriptionBlocks(
        '<p>Take <strong>one</strong> a <a href="/x">day</a>.<br>With food.</p>',
      ),
    ).toEqual([{ kind: "paragraph", text: "Take one a day.\nWith food." }]);
  });

  it("decodes entities, named and numeric", () => {
    expect(
      descriptionBlocks("<p>Fish &amp; algae &#8212; &pound;20&nbsp;off &#x2019;</p>"),
    ).toEqual([{ kind: "paragraph", text: "Fish & algae — £20 off ’" }]);
  });

  it("numbers ordered lists and skips empty blocks", () => {
    expect(
      descriptionBlocks("<ol><li>Mix</li><li> </li><li>Drink</li></ol><p> </p>"),
    ).toEqual([{ kind: "list", ordered: true, items: ["Mix", "Drink"] }]);
  });

  it("reads plain text and loose text between blocks as paragraphs", () => {
    expect(descriptionBlocks("Just text")).toEqual([
      { kind: "paragraph", text: "Just text" },
    ]);
    expect(descriptionBlocks("Intro<p>Body</p>Outro")).toEqual([
      { kind: "paragraph", text: "Intro" },
      { kind: "paragraph", text: "Body" },
      { kind: "paragraph", text: "Outro" },
    ]);
  });

  it("gives nothing for no description", () => {
    expect(descriptionBlocks(null)).toEqual([]);
    expect(descriptionBlocks("")).toEqual([]);
  });
});

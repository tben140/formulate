import { describe, expect, it } from "vitest";

import { policyBlocks, richTextBlocks } from "./rich-text";

describe("policyBlocks", () => {
  it("treats a bold line as a heading, as Shopify's templates write them", () => {
    expect(
      policyBlocks(
        "<strong>Cancellation Policy</strong> <br /> Some items may be a subscription. <br /> <strong>Subscriptions</strong> <br /> You can cancel.",
      ),
    ).toEqual([
      { kind: "heading", text: "Cancellation Policy" },
      { kind: "paragraph", text: "Some items may be a subscription." },
      { kind: "heading", text: "Subscriptions" },
      { kind: "paragraph", text: "You can cancel." },
    ]);
  });

  it("keeps headings, paragraphs and list items apart", () => {
    expect(
      policyBlocks(
        "<h2>Your rights</h2><p>You can ask for:</p><ul><li>a copy</li><li>deletion</li></ul>",
      ),
    ).toEqual([
      { kind: "heading", text: "Your rights" },
      { kind: "paragraph", text: "You can ask for:" },
      { kind: "item", text: "a copy" },
      { kind: "item", text: "deletion" },
    ]);
  });

  it("keeps a link's text and drops the markup", () => {
    expect(
      policyBlocks('<p>Email <a href="mailto:x@example.com">our team</a>.</p>'),
    ).toEqual([{ kind: "paragraph", text: "Email our team." }]);
  });

  it("doesn't make a heading of a paragraph that only starts in bold", () => {
    expect(policyBlocks("<p><strong>Note:</strong> refunds take 5 days.</p>")).toEqual([
      {
        kind: "paragraph",
        text: "Note: refunds take 5 days.",
        runs: [{ text: "Note:", bold: true }, { text: " refunds take 5 days." }],
      },
    ]);
  });

  it("decodes entities, named and numeric", () => {
    expect(
      policyBlocks("<p>Tom&rsquo;s &amp; Jo&#39;s &pound;5 &#x2014; done</p>"),
    ).toEqual([{ kind: "paragraph", text: "Tom’s & Jo's £5 — done" }]);
  });

  it("numbers an ordered list's items, from its start", () => {
    expect(
      policyBlocks('<ol start="3"><li>three</li><li>four</li></ol><ul><li>dot</li></ul>'),
    ).toEqual([
      { kind: "item", text: "three", number: 3 },
      { kind: "item", text: "four", number: 4 },
      { kind: "item", text: "dot" },
    ]);
  });

  it("numbers an outer list again after a nested one", () => {
    expect(
      policyBlocks("<ol><li>one<ul><li>sub</li></ul></li><li>two</li></ol>"),
    ).toEqual([
      { kind: "item", text: "one", number: 1 },
      { kind: "item", text: "sub" },
      { kind: "item", text: "two", number: 2 },
    ]);
  });

  it("reads past a > inside a quoted attribute", () => {
    expect(policyBlocks('<p><a title="1 > 0" href="/help">Help</a></p>')).toEqual([
      { kind: "paragraph", text: "Help" },
    ]);
  });

  it("replaces a character reference no string can hold", () => {
    expect(policyBlocks("<p>a&#x110000;b&#0;c&#xD800;d</p>")).toEqual([
      { kind: "paragraph", text: "a\uFFFDb\uFFFDc\uFFFDd" },
    ]);
  });

  it("returns nothing for an empty body", () => {
    expect(policyBlocks("  <p> </p> ")).toEqual([]);
  });
});

describe("richTextBlocks", () => {
  it("keeps bold and italic runs inside a paragraph", () => {
    expect(
      richTextBlocks(
        "<p><strong>Ingredients:</strong> citicoline, <em>rice</em> flour</p>",
      ),
    ).toEqual([
      {
        kind: "paragraph",
        text: "Ingredients: citicoline, rice flour",
        runs: [
          { text: "Ingredients:", bold: true },
          { text: " citicoline, " },
          { text: "rice", italic: true },
          { text: " flour" },
        ],
      },
    ]);
  });

  it("keeps a bold paragraph a paragraph, unlike a policy", () => {
    const html = "<p><strong>Demo store: illustrative data.</strong></p><p>Plain.</p>";
    expect(richTextBlocks(html)).toEqual([
      {
        kind: "paragraph",
        text: "Demo store: illustrative data.",
        runs: [{ text: "Demo store: illustrative data.", bold: true }],
      },
      { kind: "paragraph", text: "Plain." },
    ]);
    expect(policyBlocks(html)[0]).toEqual({
      kind: "heading",
      text: "Demo store: illustrative data.",
    });
  });

  it("reads <b> and <i> as bold and italic, and both together", () => {
    expect(richTextBlocks("<p><b>a <i>b</i></b> c</p>")[0]?.runs).toEqual([
      { text: "a ", bold: true },
      { text: "b", bold: true, italic: true },
      { text: " c" },
    ]);
  });

  it("carries bold across a line break", () => {
    expect(richTextBlocks("<p><strong>one<br>two</strong> three</p>")).toEqual([
      { kind: "paragraph", text: "one", runs: [{ text: "one", bold: true }] },
      {
        kind: "paragraph",
        text: "two three",
        runs: [{ text: "two", bold: true }, { text: " three" }],
      },
    ]);
  });

  it("keeps bold runs in list items, and leaves headings plain", () => {
    expect(
      richTextBlocks("<h3>Spec</h3><ul><li><strong>250 mg</strong> citicoline</li></ul>"),
    ).toEqual([
      { kind: "heading", text: "Spec" },
      {
        kind: "item",
        text: "250 mg citicoline",
        runs: [{ text: "250 mg", bold: true }, { text: " citicoline" }],
      },
    ]);
  });

  it("collapses whitespace across a style change, as a browser does", () => {
    expect(richTextBlocks("<p>a <strong> b </strong> c</p>")[0]?.runs).toEqual([
      { text: "a " },
      { text: "b ", bold: true },
      { text: "c" },
    ]);
  });

  it("doesn't read <br>, <img> or <body> as bold or italic", () => {
    expect(richTextBlocks('<p>a<img src="x.png">b</p>')).toEqual([
      { kind: "paragraph", text: "ab" },
    ]);
  });
});

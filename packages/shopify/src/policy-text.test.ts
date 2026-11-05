import { describe, expect, it } from "vitest";

import { policyBlocks } from "./policy-text";

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
      { kind: "paragraph", text: "Note: refunds take 5 days." },
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

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

  it("returns nothing for an empty body", () => {
    expect(policyBlocks("  <p> </p> ")).toEqual([]);
  });
});

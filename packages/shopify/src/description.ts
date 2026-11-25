/**
 * A product's rich-text description as plain blocks, for web and the app.
 *
 * Shopify's plain `description` strips the HTML without adding breaks, so a
 * heading runs into the paragraph around it ("…a day.Choose your flavourThree
 * flavours…"). `descriptionHtml` keeps the structure, but the app can't render
 * HTML and web shouldn't inject merchant markup. So both render these blocks.
 *
 * Read with htmlparser2, so nesting (a list inside a `<div>`), `>` inside an
 * attribute and every named character (`&eacute;`) come out right. Headings,
 * paragraphs and lists keep their shape; inline formatting keeps its text and
 * loses its tags; `<br>` is a line break. Nested lists flatten into the outer
 * one. Scripts, styles and other non-text elements are dropped.
 */

import { Parser } from "htmlparser2";

export type DescriptionBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
    };

/** Tags that end the text before them and start a new block. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "blockquote",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "figure",
  "figcaption",
  "pre",
  "table",
  "tr",
  "td",
  "th",
  "dl",
  "dt",
  "dd",
  "hr",
]);
const HEADING = /^h[1-6]$/;
/** Their text is never shown. */
const SKIPPED_TAGS = new Set(["script", "style", "template", "noscript", "svg", "iframe"]);

// `<br>` is held as U+2028 while text is gathered, so collapsing whitespace
// can tell it from newlines in the source, which are only spacing.
const BR = "\u2028";

/** Whitespace collapses to one space; each `<br>` becomes a newline. */
const tidy = (text: string): string =>
  text
    .replace(/[ \t\r\n\f\v\u00a0]+/g, " ")
    .replaceAll(BR, "\n")
    .replace(/ *\n */g, "\n")
    .trim();

type OpenList = { ordered: boolean; items: string[] };

export const descriptionBlocks = (
  html: string | null | undefined,
): DescriptionBlock[] => {
  if (!html) return [];
  const blocks: DescriptionBlock[] = [];

  let text = "";
  let headingDepth = 0;
  let skipDepth = 0;
  // The outermost open list; items of lists nested inside it join it.
  let list: OpenList | null = null;
  let listDepth = 0;

  const flush = () => {
    const done = tidy(text);
    text = "";
    if (!done) return;
    if (list) list.items.push(done);
    else if (headingDepth > 0) blocks.push({ kind: "heading", text: done });
    else blocks.push({ kind: "paragraph", text: done });
  };

  const endList = () => {
    if (list?.items.length) blocks.push({ kind: "list", ...list });
    list = null;
  };

  const startsBlock = (name: string) =>
    name === "li" || HEADING.test(name) || BLOCK_TAGS.has(name);

  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth += 1;
          return;
        }
        if (skipDepth > 0) return;
        if (name === "br") {
          text += BR;
        } else if (name === "ul" || name === "ol") {
          flush();
          if (listDepth === 0) list = { ordered: name === "ol", items: [] };
          listDepth += 1;
        } else if (startsBlock(name)) {
          flush();
          if (HEADING.test(name)) headingDepth += 1;
        }
      },
      ontext(chunk) {
        if (skipDepth === 0) text += chunk;
      },
      onclosetag(name) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }
        if (skipDepth > 0) return;
        if (name === "ul" || name === "ol") {
          flush();
          listDepth = Math.max(0, listDepth - 1);
          if (listDepth === 0) endList();
        } else if (startsBlock(name)) {
          flush();
          if (HEADING.test(name)) headingDepth = Math.max(0, headingDepth - 1);
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();
  flush();
  // htmlparser2 closes tags left open at the end, so a list is already ended;
  // this only guards against a parser that doesn't.
  endList();
  return blocks;
};

export type DescriptionSection = {
  readonly title: string;
  readonly blocks: readonly DescriptionBlock[];
};

/** The title for description text that has no heading of its own. */
export const DESCRIPTION_DETAILS_TITLE = "Details";

/**
 * A description split for the product page: one opening paragraph to show
 * beside the buy box, and the rest as titled sections that start closed.
 *
 * On a phone the buy box used to sit below the whole description (about
 * 1,700px down on Whey Protein). The summary keeps the product's one-line
 * pitch above it; everything else moves below, a heading per section. Text
 * before the first heading, after the summary, goes in a "Details" section.
 */
export const descriptionSections = (
  blocks: readonly DescriptionBlock[],
): {
  readonly summary: string | null;
  readonly sections: readonly DescriptionSection[];
} => {
  const [first, ...rest] = blocks;
  const summary = first?.kind === "paragraph" ? first.text : null;
  const remaining = summary === null ? blocks : rest;

  const sections: { title: string; blocks: DescriptionBlock[] }[] = [];
  for (const block of remaining) {
    if (block.kind === "heading") {
      sections.push({ title: block.text, blocks: [] });
      continue;
    }
    let current = sections.at(-1);
    if (!current) {
      current = { title: DESCRIPTION_DETAILS_TITLE, blocks: [] };
      sections.push(current);
    }
    current.blocks.push(block);
  }
  // A heading with nothing under it says nothing when opened.
  return { summary, sections: sections.filter((section) => section.blocks.length > 0) };
};

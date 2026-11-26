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
 * one, and paragraphs inside one item stay in it, a line apart. Scripts,
 * styles and other non-text elements are dropped.
 *
 * Links in paragraphs and list items are kept as runs, for web to render as
 * links: only web, mail and same-site destinations, as the old sanitised HTML
 * allowed. `text` always holds the whole text, so the app, which shows no
 * links, reads only that.
 */

import { Parser } from "htmlparser2";

/** A stretch of text, and where it links to if it is a link. */
export type DescriptionRun = { readonly text: string; readonly href?: string };

export type DescriptionBlock =
  | { readonly kind: "heading"; readonly text: string }
  | {
      readonly kind: "paragraph";
      readonly text: string;
      /** Only when the paragraph has a link. */
      readonly runs?: readonly DescriptionRun[];
    }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
      /** Only when an item has a link: one entry per item. */
      readonly runs?: readonly (readonly DescriptionRun[])[];
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
const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "iframe",
]);

// `<br>` is held as U+2028 while text is gathered, so collapsing whitespace
// can tell it from newlines in the source, which are only spacing.
const BR = "\u2028";
// A link's start and end, held in the text the same way; the hrefs wait in
// order beside it.
const LINK_START = "\ue000";
const LINK_END = "\ue001";
const MARKERS = /[\ue000\ue001]/g;

/** Web, mail and same-site links; anything else stays plain text. */
const safeHref = (href: string | undefined): string | null => {
  const value = href?.trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^(\/(?!\/)|#|\?)/.test(value)) return value;
  return null;
};

/** Whitespace collapses to one space; each `<br>` becomes a newline. */
const tidy = (text: string): string =>
  text
    .replace(/[ \t\r\n\f\v\u00a0]+/g, " ")
    .replaceAll(BR, "\n")
    .replace(/ *\n */g, "\n")
    .trim();

type Text = { text: string; runs: DescriptionRun[] | null };

/** Splits tidied text at its link markers; runs only when there is a link. */
const toRuns = (marked: string, hrefs: string[]): Text => {
  const text = marked.replace(MARKERS, "").trim();
  if (!marked.includes(LINK_START)) return { text, runs: null };
  const runs: { text: string; href?: string }[] = [];
  let href: string | undefined;
  for (const part of marked.split(/([\ue000\ue001])/)) {
    if (part === LINK_START) href = hrefs.shift();
    else if (part === LINK_END) href = undefined;
    else if (part) runs.push(href ? { text: part, href } : { text: part });
  }
  const first = runs[0];
  const last = runs.at(-1);
  if (first) first.text = first.text.trimStart();
  if (last) last.text = last.text.trimEnd();
  const kept = runs.filter((run) => run.text);
  return { text, runs: kept.some((run) => run.href) ? kept : null };
};

/** Paragraphs inside one list item, joined a line apart. */
const joinTexts = (parts: Text[]): Text => {
  const text = parts.map((part) => part.text).join("\n");
  if (!parts.some((part) => part.runs)) return { text, runs: null };
  const runs = parts.flatMap((part, index) => [
    ...(index > 0 ? [{ text: "\n" }] : []),
    ...(part.runs ?? [{ text: part.text }]),
  ]);
  return { text, runs };
};

type OpenList = { ordered: boolean; items: Text[] };

export const descriptionBlocks = (
  html: string | null | undefined,
): DescriptionBlock[] => {
  if (!html) return [];
  const blocks: DescriptionBlock[] = [];

  let text = "";
  // The safe hrefs of the links opened in `text`, in order.
  let hrefs: string[] = [];
  // For each open `<a>`, whether it was marked (an unsafe href is plain text).
  const linkOpen: boolean[] = [];
  let headingDepth = 0;
  let skipDepth = 0;
  // The outermost open list; items of lists nested inside it join it.
  let list: OpenList | null = null;
  let listDepth = 0;
  // The paragraphs of the open list item, kept together as one item.
  let item: Text[] | null = null;

  const flush = () => {
    const done = toRuns(tidy(text), hrefs);
    text = "";
    hrefs = [];
    if (!done.text) return;
    if (item) item.push(done);
    else if (list) list.items.push(done);
    else if (headingDepth > 0) blocks.push({ kind: "heading", text: done.text });
    else
      blocks.push(
        done.runs
          ? { kind: "paragraph", text: done.text, runs: done.runs }
          : { kind: "paragraph", text: done.text },
      );
  };

  const endItem = () => {
    if (item?.length) list?.items.push(joinTexts(item));
    item = null;
  };

  const endList = () => {
    endItem();
    if (list?.items.length) {
      const { ordered, items } = list;
      const texts = items.map((entry) => entry.text);
      blocks.push(
        items.some((entry) => entry.runs)
          ? {
              kind: "list",
              ordered,
              items: texts,
              runs: items.map((entry) => entry.runs ?? [{ text: entry.text }]),
            }
          : { kind: "list", ordered, items: texts },
      );
    }
    list = null;
  };

  const startsBlock = (name: string) => HEADING.test(name) || BLOCK_TAGS.has(name);

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth += 1;
          return;
        }
        if (skipDepth > 0) return;
        if (name === "br") {
          text += BR;
        } else if (name === "a") {
          const href = safeHref(attributes.href);
          linkOpen.push(href !== null);
          if (href !== null) {
            hrefs.push(href);
            text += LINK_START;
          }
        } else if (name === "ul" || name === "ol") {
          flush();
          // Text of an outer item before a nested list is an item of its own.
          endItem();
          if (listDepth === 0) list = { ordered: name === "ol", items: [] };
          listDepth += 1;
        } else if (name === "li") {
          flush();
          endItem();
          if (list) item = [];
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
        if (name === "a") {
          if (linkOpen.pop()) text += LINK_END;
        } else if (name === "ul" || name === "ol") {
          flush();
          endItem();
          listDepth = Math.max(0, listDepth - 1);
          if (listDepth === 0) endList();
        } else if (name === "li") {
          flush();
          endItem();
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
  /** Only when the summary has a link. */
  readonly summaryRuns?: readonly DescriptionRun[];
  readonly sections: readonly DescriptionSection[];
} => {
  const [first, ...rest] = blocks;
  const opening = first?.kind === "paragraph" ? first : null;
  const summary = opening?.text ?? null;
  const remaining = opening === null ? blocks : rest;

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
  const kept = sections.filter((section) => section.blocks.length > 0);
  return opening?.runs
    ? { summary, summaryRuns: opening.runs, sections: kept }
    : { summary, sections: kept };
};

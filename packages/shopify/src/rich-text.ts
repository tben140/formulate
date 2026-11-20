/**
 * Store rich text (a product description, a policy body) as plain blocks with
 * their bold and italic runs, for a surface with no HTML renderer (the app).
 * Web renders the HTML itself and doesn't need this.
 *
 * This is what the merchant writes in Shopify admin's rich text editor:
 * paragraphs, headings, lists, line breaks, and bold or italic text. Links and
 * every other tag are reduced to their text.
 *
 * An item of a numbered list (`<ol>`, honouring `start`) carries its number;
 * a bulleted one doesn't. A block with any bold or italic text carries
 * `runs`, the text split where its style changes; a plain block doesn't.
 */
export interface TextRun {
  readonly text: string;
  readonly bold?: true;
  readonly italic?: true;
}

export type RichTextBlock =
  | {
      readonly kind: "heading" | "paragraph";
      readonly text: string;
      readonly runs?: readonly TextRun[];
    }
  | {
      readonly kind: "item";
      readonly text: string;
      readonly runs?: readonly TextRun[];
      readonly number?: number;
    };

export interface RichTextOptions {
  /**
   * Read a line that is bold from end to end as a heading, as Shopify's policy
   * templates write them (`<strong>Subscriptions</strong><br>`). Off for a
   * product description, where a bold paragraph is just emphasis.
   */
  readonly boldLineHeadings?: boolean;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  pound: "£",
  euro: "€",
  copy: "©",
};

/** A code point a string can hold, else U+FFFD, as browsers do. */
const fromCodePoint = (point: number) =>
  point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff)
    ? String.fromCodePoint(point)
    : "\uFFFD";

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return fromCodePoint(Number.parseInt(code.slice(1), 10));
    return NAMED[code.toLowerCase()] ?? entity;
  });

/**
 * A tag's attributes, where a quoted value may hold a `>`
 * (`<a title="1 > 0">`), so `[^>]*` would end the tag early.
 */
const ATTRS = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const TAG = new RegExp(String.raw`<\/?[a-z]${ATTRS}>|<!--[\s\S]*?-->`, "gi");

/** Inline tags that turn a style on or off. `\b` keeps `<br>` and `<img>` out. */
const STYLE = /^<(\/?)(strong|b|em|i)\b/i;

/**
 * Splits a block's HTML into runs of one style, whitespace collapsed as a
 * browser would. `style` is the bold and italic depth so far, carried from
 * block to block because `<strong>a<br>b</strong>` keeps "b" bold.
 */
const toRuns = (html: string, style: { bold: number; italic: number }): TextRun[] => {
  const runs: { text: string; bold: boolean; italic: boolean }[] = [];
  const push = (raw: string) => {
    let text = decode(raw).replace(/\s+/g, " ");
    if (text.startsWith(" ") && (runs.length === 0 || runs.at(-1)?.text.endsWith(" ")))
      text = text.slice(1);
    if (!text) return;
    const bold = style.bold > 0;
    const italic = style.italic > 0;
    const last = runs.at(-1);
    if (last?.bold === bold && last.italic === italic) last.text += text;
    else runs.push({ text, bold, italic });
  };
  let last = 0;
  for (const match of html.matchAll(TAG)) {
    push(html.slice(last, match.index));
    last = match.index + match[0].length;
    const tag = STYLE.exec(match[0]);
    if (!tag) continue;
    const key = /^(b|strong)$/i.test(tag[2] ?? "") ? "bold" : "italic";
    style[key] = Math.max(0, style[key] + (tag[1] ? -1 : 1));
  }
  push(html.slice(last));
  const end = runs.at(-1);
  if (end) end.text = end.text.trimEnd();
  return runs
    .filter((run) => run.text)
    .map(({ text, bold, italic }) => ({
      text,
      ...(bold ? { bold: true as const } : {}),
      ...(italic ? { italic: true as const } : {}),
    }));
};

/** Tags that end one block and start the next. */
const BLOCK = new RegExp(
  String.raw`<\/?(?:p|div|h[1-6]|ul|ol|li|section|article|blockquote|table|tr)\b${ATTRS}>|<br\b${ATTRS}>`,
  "gi",
);

export const richTextBlocks = (
  html: string,
  { boldLineHeadings = false }: RichTextOptions = {},
): RichTextBlock[] => {
  const blocks: RichTextBlock[] = [];
  let kind: RichTextBlock["kind"] = "paragraph";
  let last = 0;
  // Open lists, innermost last: the next number for an <ol>, null for a <ul>.
  const lists: (number | null)[] = [];
  let number: number | undefined;
  const style = { bold: 0, italic: 0 };

  const flush = (raw: string) => {
    const runs = toRuns(raw, style);
    const text = runs.map((run) => run.text).join("");
    if (!text) return;
    const styled = runs.some((run) => run.bold || run.italic) ? { runs } : {};
    if (kind === "item") {
      blocks.push(
        number === undefined
          ? { kind, text, ...styled }
          : { kind, text, ...styled, number },
      );
      // A second block in the same item (after a <br>) isn't numbered again.
      number = undefined;
    } else if (kind === "heading") blocks.push({ kind, text });
    else if (boldLineHeadings && runs.length === 1 && runs[0]?.bold)
      blocks.push({ kind: "heading", text });
    else blocks.push({ kind, text, ...styled });
  };

  for (const match of html.matchAll(BLOCK)) {
    flush(html.slice(last, match.index));
    last = match.index + match[0].length;
    const tag = match[0].toLowerCase();
    if (/^<ol\b/.test(tag)) {
      const start = /\bstart\s*=\s*["']?(-?\d+)/.exec(tag);
      lists.push(start ? Number(start[1]) : 1);
    } else if (/^<ul\b/.test(tag)) lists.push(null);
    else if (/^<\/(ol|ul)\b/.test(tag)) lists.pop();
    if (/^<h[1-6]\b/.test(tag)) kind = "heading";
    else if (/^<li\b/.test(tag)) {
      kind = "item";
      const next = lists.at(-1);
      number = next ?? undefined;
      if (typeof next === "number") lists[lists.length - 1] = next + 1;
    } else if (tag.startsWith("</") || /^<(p|div|br)\b/.test(tag)) kind = "paragraph";
  }
  flush(html.slice(last));
  return blocks;
};

/** A policy body's blocks, where a bold line is a heading. */
export const policyBlocks = (html: string): RichTextBlock[] =>
  richTextBlocks(html, { boldLineHeadings: true });

/**
 * A store policy's HTML body as plain blocks of text, for a surface with no
 * HTML renderer (the app).
 *
 * Policy bodies are what the merchant writes, or pastes from Shopify's
 * templates, in admin → Settings → Policies: paragraphs, headings, lists and
 * line breaks, with Shopify's templates marking headings as a bold line
 * (`<strong>Subscriptions</strong><br>`). Everything else, links included, is
 * reduced to its text. Web renders the HTML itself and doesn't need this.
 *
 * An item of a numbered list (`<ol>`, honouring `start`) carries its number;
 * a bulleted one doesn't.
 */
export type PolicyBlock =
  | { readonly kind: "heading" | "paragraph"; readonly text: string }
  | { readonly kind: "item"; readonly text: string; readonly number?: number };

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

const clean = (text: string) => decode(text.replace(TAG, "")).replace(/\s+/g, " ").trim();

/** Tags that end one block and start the next. */
const BLOCK = new RegExp(
  String.raw`<\/?(?:p|div|h[1-6]|ul|ol|li|section|article|blockquote|table|tr)\b${ATTRS}>|<br\b${ATTRS}>`,
  "gi",
);

export const policyBlocks = (html: string): PolicyBlock[] => {
  const blocks: PolicyBlock[] = [];
  let kind: PolicyBlock["kind"] = "paragraph";
  let last = 0;
  // Open lists, innermost last: the next number for an <ol>, null for a <ul>.
  const lists: (number | null)[] = [];
  let number: number | undefined;

  const flush = (raw: string) => {
    const text = clean(raw);
    if (!text) return;
    // A line that is bold from end to end is a heading in Shopify's templates.
    const bold = /^\s*<(strong|b)\b[^>]*>([\s\S]*)<\/\1>\s*$/i.exec(raw);
    const isBoldLine = bold !== null && !/<(strong|b)\b/i.test(bold[2] ?? "");
    if (kind === "item") {
      blocks.push(number === undefined ? { kind, text } : { kind, text, number });
      // A second block in the same item (after a <br>) isn't numbered again.
      number = undefined;
    } else
      blocks.push({ kind: kind === "paragraph" && isBoldLine ? "heading" : kind, text });
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

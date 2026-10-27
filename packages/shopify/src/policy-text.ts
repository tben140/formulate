/**
 * A store policy's HTML body as plain blocks of text, for a surface with no
 * HTML renderer (the app).
 *
 * Policy bodies are what the merchant writes, or pastes from Shopify's
 * templates, in admin → Settings → Policies: paragraphs, headings, lists and
 * line breaks, with Shopify's templates marking headings as a bold line
 * (`<strong>Subscriptions</strong><br>`). Everything else, links included, is
 * reduced to its text. Web renders the HTML itself and doesn't need this.
 */
export type PolicyBlock = {
  readonly kind: "heading" | "paragraph" | "item";
  readonly text: string;
};

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

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#"))
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return NAMED[code.toLowerCase()] ?? entity;
  });

const clean = (text: string) =>
  decode(text.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** Tags that end one block and start the next. */
const BLOCK =
  /<\/?(?:p|div|h[1-6]|ul|ol|li|section|article|blockquote|table|tr)\b[^>]*>|<br\s*\/?>/gi;

export const policyBlocks = (html: string): PolicyBlock[] => {
  const blocks: PolicyBlock[] = [];
  let kind: PolicyBlock["kind"] = "paragraph";
  let last = 0;

  const flush = (raw: string) => {
    const text = clean(raw);
    if (!text) return;
    // A line that is bold from end to end is a heading in Shopify's templates.
    const bold = /^\s*<(strong|b)\b[^>]*>([\s\S]*)<\/\1>\s*$/i.exec(raw);
    const isBoldLine = bold !== null && !/<(strong|b)\b/i.test(bold[2] ?? "");
    blocks.push({ kind: kind === "paragraph" && isBoldLine ? "heading" : kind, text });
  };

  for (const match of html.matchAll(BLOCK)) {
    flush(html.slice(last, match.index));
    last = match.index + match[0].length;
    const tag = match[0].toLowerCase();
    if (/^<h[1-6]\b/.test(tag)) kind = "heading";
    else if (/^<li\b/.test(tag)) kind = "item";
    else if (tag.startsWith("</") || /^<(p|div|br)\b/.test(tag)) kind = "paragraph";
  }
  flush(html.slice(last));
  return blocks;
};

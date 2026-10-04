/**
 * A product's rich-text description as plain blocks, for web and the app.
 *
 * Shopify's plain `description` strips the HTML without adding breaks, so a
 * heading runs into the paragraph around it ("…a day.Choose your flavourThree
 * flavours…"). `descriptionHtml` keeps the structure, but the app can't render
 * HTML and web shouldn't inject merchant markup. So both render these blocks.
 *
 * Handles what Shopify's editor produces: paragraphs, headings, bulleted and
 * numbered lists, line breaks and inline formatting (whose tags are dropped,
 * keeping the text). Anything else is read as text. Not a general HTML parser,
 * and not trying to be.
 */

export type DescriptionBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
    };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  pound: "£",
};

const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

/** Inline content to text: <br> becomes a newline, other tags go, spaces collapse. */
const inlineText = (html: string): string =>
  decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/ *\n */g, "\n"),
  ).trim();

const BLOCK = /<(p|h[1-6]|ul|ol|div|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;

export const descriptionBlocks = (
  html: string | null | undefined,
): DescriptionBlock[] => {
  if (!html) return [];
  const blocks: DescriptionBlock[] = [];

  const pushText = (raw: string) => {
    const text = inlineText(raw);
    if (text) blocks.push({ kind: "paragraph", text });
  };

  let last = 0;
  for (const match of html.matchAll(BLOCK)) {
    // Loose text between blocks still counts.
    pushText(html.slice(last, match.index));
    last = match.index + match[0].length;

    const tag = (match[1] ?? "").toLowerCase();
    const inner = match[2] ?? "";
    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((item) => inlineText(item[1] ?? ""))
        .filter(Boolean);
      if (items.length) blocks.push({ kind: "list", ordered: tag === "ol", items });
    } else if (tag.startsWith("h")) {
      const text = inlineText(inner);
      if (text) blocks.push({ kind: "heading", text });
    } else {
      pushText(inner);
    }
  }
  pushText(html.slice(last));
  return blocks;
};

import { caniemail } from "caniemail";
import { parseDocument } from "htmlparser2";

type EmailClientGlobs = Parameters<typeof caniemail>[0]["clients"][number];
type ChildNode = ReturnType<typeof parseDocument>["children"][number];
interface Element {
  readonly name: string;
  readonly attribs: Record<string, string | undefined>;
  readonly children: ChildNode[];
}

const isElement = (node: ChildNode): node is ChildNode & Element => "attribs" in node;

/**
 * The clients Double Helix emails are built for (docs/email-testing.md): the
 * big four inboxes on every platform, and Samsung's, the Android default.
 * caniemail.com's data says what each supports.
 */
export const CLIENTS: readonly EmailClientGlobs[] = [
  "apple-mail.*",
  "gmail.*",
  "outlook.*",
  "yahoo.*",
  "samsung-email.android",
];

/**
 * Features caniemail reports as unsupported somewhere, that the templates use
 * on purpose because each one degrades safely. Anything not listed fails the
 * check: a new feature is either removed or added here with its reason.
 */
export const HANDLED: Readonly<Record<string, string>> = {
  "color-scheme CSS property":
    "Dark-mode opt-in. Clients without it invert colours themselves; the light palette is chosen to survive that.",
  "color-scheme meta tag":
    "As the CSS property: an opt-in that unsupporting clients skip.",
  "@media":
    "Phone and dark-mode refinements. Every layout works at 600px and in light without them.",
  "<style> element":
    "Only refinements live in <style>: every colour and size is also inline, so a client that strips it shows the light design.",
  "<body> element":
    "The page background is repeated on the outer table, which every client keeps.",
  "Class selector":
    "Selectors in <style> only; the inline styles carry the design without them.",
  "Type selector": "Resets only (body, table, img, a).",
  "Attribute selector":
    "Outlook.com's [data-ogsc]/[data-ogsb] dark-mode hooks; harmless elsewhere.",
  "Descendant combinator": "Outlook.com's dark-mode hooks only.",
  "display:none":
    "Hides the preheader. Where it's unsupported, max-height:0 with overflow:hidden still hides it.",
  visibility: "Part of hiding the preheader; display:none and mso-hide cover the rest.",
  opacity: "Part of hiding the preheader.",
  "max-height property": "Part of hiding the preheader.",
  overflow: "Part of hiding the preheader.",
  outline: "The image reset; nothing relies on it.",
  "border-radius": "Rounded corners. Outlook for Windows shows square ones.",
  "height property":
    "height:auto on images, so they scale; width attributes size them in Outlook.",
  "role attribute":
    "role=presentation on layout tables for screen readers; ignored where unsupported.",
};

/** Gmail clips a message longer than this, hiding the rest behind a link. */
export const GMAIL_CLIP_BYTES = 102 * 1024;

export interface CheckResult {
  /** Things to fix before the email can be used. */
  readonly errors: readonly string[];
  /** Worth knowing; not blocking. */
  readonly warnings: readonly string[];
}

const elements = (nodes: readonly ChildNode[]): Element[] =>
  nodes.flatMap((node) =>
    isElement(node)
      ? [node, ...elements(node.children)]
      : "children" in node
        ? elements(node.children)
        : [],
  );

const text = (node: ChildNode | Element): string =>
  "data" in node && !("children" in node)
    ? node.data
    : "children" in node
      ? (node.children as ChildNode[]).map(text).join("")
      : "";

/** A Klaviyo template tag or variable, which Klaviyo fills in at send time. */
const isTemplateTag = (value: string) => /^\s*(\{%|\{\{)/.test(value);

/**
 * The house rules for an email's HTML, from what breaks in real inboxes:
 * dark mode declared and styled, accessible tables and images, links that
 * work, an unsubscribe link, and a size Gmail won't clip.
 */
export const checkStructure = (html: string): CheckResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const all = elements(parseDocument(html).children);
  const byName = (name: string) => all.filter((element) => element.name === name);

  const root = byName("html")[0];
  if (!root?.attribs.lang)
    errors.push('<html> needs a lang attribute (lang="en"), for screen readers.');
  if (!byName("title")[0] || !text(byName("title")[0]!).trim())
    errors.push("<title> is missing or empty; some clients show it in the web view tab.");

  const metas = byName("meta");
  const meta = (name: string) =>
    metas.find((m) => m.attribs.name === name)?.attribs.content ?? "";
  if (!/light/.test(meta("color-scheme")) || !/dark/.test(meta("color-scheme")))
    errors.push('<meta name="color-scheme" content="light dark"> is missing.');
  if (!/dark/.test(meta("supported-color-schemes")))
    errors.push(
      '<meta name="supported-color-schemes" content="light dark"> is missing (older Apple Mail).',
    );

  const css = byName("style").map(text).join("\n");
  if (!/@media[^{]*prefers-color-scheme\s*:\s*dark/.test(css))
    errors.push(
      "No @media (prefers-color-scheme: dark) styles: Apple Mail and Outlook for Mac would show the light design on a dark screen.",
    );
  if (!/\[data-ogsc\]/.test(css))
    warnings.push(
      "No [data-ogsc] styles: Outlook.com and the Outlook apps will pick their own dark-mode text colours.",
    );

  if (byName("script").length > 0)
    errors.push("<script> never runs in email and gets the message flagged.");
  if (byName("form").length > 0)
    errors.push("<form> doesn't work in most clients; link to the site instead.");

  for (const table of byName("table")) {
    if (table.attribs.role !== "presentation")
      errors.push(
        'Every layout <table> needs role="presentation", or screen readers announce rows and columns.',
      );
  }

  for (const image of byName("img")) {
    const src = image.attribs.src ?? "(no src)";
    if (image.attribs.alt === undefined)
      errors.push(
        `<img src="${src}"> has no alt attribute. Describe it, or alt="" if it's decoration.`,
      );
    if (!image.attribs.width)
      errors.push(
        `<img src="${src}"> needs a width attribute; Outlook for Windows ignores CSS widths.`,
      );
    if (src.startsWith("http:"))
      errors.push(`<img src="${src}"> is http:, which clients block.`);
  }

  let unsubscribe = false;
  for (const link of byName("a")) {
    const href = link.attribs.href ?? "";
    if (/unsubscribe/.test(href)) unsubscribe = true;
    if (!href || href === "#")
      errors.push(`A link ("${text(link).trim()}") goes nowhere.`);
    else if (isTemplateTag(href)) continue;
    else if (/^(https:|mailto:|tel:)/.test(href)) {
      if (/localhost|127\.0\.0\.1|\.vercel\.app|myshopify\.com/.test(href))
        errors.push(`${href} isn't the public site.`);
    } else errors.push(`${href} must be https:, mailto: or tel:.`);
    if (
      !text(link).trim() &&
      !elements(link.children).some((e) => e.name === "img" && e.attribs.alt)
    )
      errors.push(`The link to ${href} has no text for screen readers.`);
  }
  if (!unsubscribe)
    errors.push(
      "No unsubscribe link: use {% unsubscribe_link %}. Klaviyo and the law both require one.",
    );

  if (!all.some((element) => /\bpreheader\b/.test(element.attribs.class ?? "")))
    warnings.push(
      "No hidden preheader: the inbox preview will show the first words of the body.",
    );

  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > GMAIL_CLIP_BYTES)
    errors.push(`${Math.round(bytes / 1024)} KB: Gmail clips anything over 102 KB.`);
  else if (bytes > GMAIL_CLIP_BYTES * 0.8)
    warnings.push(
      `${Math.round(bytes / 1024)} KB: near Gmail's 102 KB clipping limit (Klaviyo adds tracking too).`,
    );

  return { errors, warnings };
};

/**
 * Features of the HTML and CSS that some target client doesn't support,
 * from caniemail.com. Errors are features not in HANDLED; warnings are
 * partial support, grouped by feature.
 */
export const checkSupport = (html: string): CheckResult => {
  const { issues } = caniemail({ clients: [...CLIENTS], html });
  const group = (map: typeof issues.errors) => {
    const clients = new Map<string, Set<string>>();
    for (const [client, list] of map)
      for (const issue of list)
        clients.set(issue.title, (clients.get(issue.title) ?? new Set()).add(client));
    return clients;
  };
  const errors = [...group(issues.errors)]
    .filter(([title]) => !(title in HANDLED))
    .map(
      ([title, clients]) =>
        `${title} isn't supported in ${[...clients].sort().join(", ")}.`,
    );
  const warnings = [...group(issues.warnings)].map(
    ([title, clients]) =>
      `${title}: partial support in ${[...clients].sort().join(", ")}.`,
  );
  return { errors, warnings };
};

/** Both checks together. */
export const checkEmail = (html: string): CheckResult => {
  const structure = checkStructure(html);
  const support = checkSupport(html);
  return {
    errors: [...structure.errors, ...support.errors],
    warnings: [...structure.warnings, ...support.warnings],
  };
};

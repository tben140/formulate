import sanitizeHtml from "sanitize-html";

/**
 * What the admin's rich-text editor writes. Anything else is dropped (its text
 * kept), so a description from an app or a CSV import can't run script on the
 * storefront: no event handlers, no styles, and links only to web or mail,
 * opening in the same tab (no target or rel, so no rel="opener").
 */
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "div",
    "a",
    "table",
    "colgroup",
    "col",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

/**
 * Rich text the merchant wrote in Shopify admin: a product description or a
 * policy body. It is sanitised all the same, since not every writer of it is
 * trusted (see ALLOWED). The arbitrary variants style its unclassed elements,
 * since Tailwind's preflight strips their defaults; bold is set to the weight
 * the font ships in globals.css.
 */
const StoreHtml = ({ html, className = "" }: { html: string; className?: string }) => (
  <div
    className={`text-foreground-muted [&_a]:text-brand-600 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
    dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, ALLOWED) }}
  />
);

export { StoreHtml };

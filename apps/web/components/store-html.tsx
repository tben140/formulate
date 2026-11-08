/**
 * Rich text the merchant wrote in Shopify admin: a product description or a
 * policy body. It is store content, not shopper input. The arbitrary variants
 * style its unclassed elements, since Tailwind's preflight strips their
 * defaults; bold is set to the weight the font ships in globals.css.
 */
const StoreHtml = ({ html, className = "" }: { html: string; className?: string }) => (
  <div
    className={`text-foreground-muted [&_a]:text-brand-600 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
    dangerouslySetInnerHTML={{ __html: html }}
  />
);

export { StoreHtml };

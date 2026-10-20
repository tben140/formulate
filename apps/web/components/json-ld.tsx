import { serialiseJsonLd } from "@/lib/structured-data";

/**
 * Structured data for search engines. A Server Component: it renders once, in
 * the HTML, and ships no JavaScript.
 */
export const JsonLd = ({ data }: { data: unknown }) => (
  <script
    type="application/ld+json"
    // Safe: serialiseJsonLd escapes every character that could end the element.
    dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
  />
);

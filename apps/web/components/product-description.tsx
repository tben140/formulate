import { descriptionBlocks } from "@formulate/shopify";

/**
 * The product's rich-text description, as headings, paragraphs and lists.
 *
 * Built from `descriptionHtml` through the shared parser, not injected as
 * HTML: no merchant markup reaches the page, and the app renders the same
 * blocks. Shopify's plain `description` ran headings into paragraphs.
 */
export const ProductDescription = ({ html }: { readonly html: string }) => {
  const blocks = descriptionBlocks(html);
  if (blocks.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 text-foreground-muted">
      {blocks.map((block, index) => {
        // Blocks have no ids, and the list never reorders, so the index is a
        // stable key here.
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          // h2: the product title is the page's h1.
          return (
            <h2 key={key} className="pt-2 text-base font-semibold text-foreground">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={key}
              className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{item}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className="whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
};

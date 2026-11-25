import type { DescriptionBlock } from "@formulate/shopify";
import { descriptionBlocks, descriptionSections } from "@formulate/shopify";

/**
 * The product's rich-text description, as headings, paragraphs and lists.
 *
 * Built from `descriptionHtml` through the shared parser, not injected as
 * HTML: no merchant markup reaches the page, and the app renders the same
 * blocks. Shopify's plain `description` ran headings into paragraphs.
 */
const DescriptionBlocks = ({
  blocks,
}: {
  readonly blocks: readonly DescriptionBlock[];
}) => {
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-foreground-muted">
      {blocks.map((block, index) => {
        // Blocks have no ids, and the list never reorders, so the index is a
        // stable key here.
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          // h2: the product title is the page's h1.
          return (
            <h2
              key={key}
              className="whitespace-pre-line pt-2 text-base font-semibold text-foreground"
            >
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
                <li key={`${key}-${itemIndex}`} className="whitespace-pre-line">
                  {item}
                </li>
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

/**
 * The description's opening paragraph, shown under the title and above the
 * buy box. See `descriptionSections`.
 */
export const ProductSummary = ({ html }: { readonly html: string }) => {
  const { summary } = descriptionSections(descriptionBlocks(html));
  if (!summary) return null;
  return <p className="mt-3 whitespace-pre-line text-foreground-muted">{summary}</p>;
};

/**
 * The rest of the description, below the buy box: one closed section per
 * heading, so the details are a tap away without pushing the button down.
 */
export const ProductDetails = ({ html }: { readonly html: string }) => {
  const { sections } = descriptionSections(descriptionBlocks(html));
  if (sections.length === 0) return null;

  return (
    <div className="mt-8 divide-y divide-border border-y border-border">
      {sections.map((section, index) => (
        // Sections have no ids, and never reorder.
        <details key={`${section.title}-${index}`} className="group py-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {/* h2: the product title is the page's h1. */}
            <h2 className="text-base">{section.title}</h2>
            <span
              aria-hidden="true"
              className="text-xl leading-none text-foreground-muted transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="pb-4">
            <DescriptionBlocks blocks={section.blocks} />
          </div>
        </details>
      ))}
    </div>
  );
};

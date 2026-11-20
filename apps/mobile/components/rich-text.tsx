import { richTextBlocks, type RichTextBlock } from "@formulate/shopify";
import { Text, View } from "react-native";

/**
 * Store rich text (a product description, a policy body) as native text. The
 * app has no HTML renderer, so the HTML becomes headings, paragraphs and list
 * items with their bold and italic runs (richTextBlocks). Links keep their
 * text but aren't tappable.
 */
const RichText = ({
  html,
  boldLineHeadings = false,
  className = "",
}: {
  html: string;
  /** Read a bold line as a heading, as Shopify's policy templates do. */
  boldLineHeadings?: boolean;
  className?: string;
}) => (
  <View className={`gap-3 ${className}`}>
    {richTextBlocks(html, { boldLineHeadings }).map((block, index) =>
      block.kind === "heading" ? (
        <Text
          // The blocks never reorder, so their position is a stable key.
          key={index}
          accessibilityRole="header"
          className="mt-3 text-lg font-semibold text-foreground"
        >
          {block.text}
        </Text>
      ) : (
        <Text key={index} className="text-base leading-6 text-foreground-muted">
          {block.kind === "item"
            ? `${block.number === undefined ? "•" : `${block.number}.`}  `
            : null}
          <Runs block={block} />
        </Text>
      ),
    )}
  </View>
);

const Runs = ({ block }: { block: RichTextBlock }) =>
  block.runs
    ? block.runs.map((run, index) => (
        <Text
          key={index}
          className={[run.bold ? "font-semibold" : "", run.italic ? "italic" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {run.text}
        </Text>
      ))
    : block.text;

export { RichText };

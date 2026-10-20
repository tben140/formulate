import { descriptionBlocks } from "@formulate/shopify";
import { View } from "react-native";

import { Text } from "./text";

/**
 * The product's rich-text description, as headings, paragraphs and lists: the
 * same blocks web renders, from the shared parser. Shopify's plain
 * `description` ran headings into paragraphs.
 */
export const ProductDescription = ({ html }: { readonly html: string }) => {
  const blocks = descriptionBlocks(html);
  if (blocks.length === 0) return null;

  return (
    <View className="gap-3">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          return (
            <Text
              key={key}
              accessibilityRole="header"
              className="pt-2 text-base font-semibold text-foreground"
            >
              {block.text}
            </Text>
          );
        }
        if (block.kind === "list") {
          return (
            <View key={key} className="gap-1">
              {block.items.map((item, itemIndex) => (
                <View
                  key={`${key}-${itemIndex}`}
                  className="flex-row gap-2"
                  // One element for screen readers, so an ordered step keeps
                  // its number ("1. Mix…"); the visual marker is hidden.
                  accessible
                  accessibilityLabel={block.ordered ? `${itemIndex + 1}. ${item}` : item}
                >
                  {/* The marker is decoration; the label above carries it. */}
                  <Text
                    className="text-base text-foreground-muted"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    {block.ordered ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <Text className="flex-1 text-base text-foreground-muted">{item}</Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={key} className="text-base text-foreground-muted">
            {block.text}
          </Text>
        );
      })}
    </View>
  );
};

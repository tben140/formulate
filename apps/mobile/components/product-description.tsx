import type { DescriptionBlock } from "@formulate/shopify";
import { descriptionBlocks, descriptionSections } from "@formulate/shopify";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "./text";

/**
 * The product's rich-text description, as headings, paragraphs and lists: the
 * same blocks web renders, from the shared parser. Shopify's plain
 * `description` ran headings into paragraphs.
 */
const DescriptionBlocks = ({
  blocks,
}: {
  readonly blocks: readonly DescriptionBlock[];
}) => {
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

/**
 * The description's opening paragraph, under the title and above the buy
 * box. See descriptionSections in packages/shopify.
 */
export const ProductSummary = ({ html }: { readonly html: string }) => {
  const { summary } = descriptionSections(descriptionBlocks(html));
  if (!summary) return null;
  return <Text className="text-base text-foreground-muted">{summary}</Text>;
};

const DetailsSection = ({
  title,
  blocks,
}: {
  readonly title: string;
  readonly blocks: readonly DescriptionBlock[];
}) => {
  const [open, setOpen] = useState(false);
  return (
    <View className="border-t border-border">
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-11 flex-row items-center justify-between gap-4 py-2"
      >
        <Text
          accessibilityRole="header"
          className="text-base font-semibold text-foreground"
        >
          {title}
        </Text>
        <Text
          className="text-xl text-foreground-muted"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {open ? "−" : "+"}
        </Text>
      </Pressable>
      {open ? (
        <View className="pb-4">
          <DescriptionBlocks blocks={blocks} />
        </View>
      ) : null}
    </View>
  );
};

/**
 * The rest of the description, below the buy box: one closed section per
 * heading, so the details are a tap away without pushing the button down.
 */
export const ProductDetails = ({ html }: { readonly html: string }) => {
  const { sections } = descriptionSections(descriptionBlocks(html));
  if (sections.length === 0) return null;
  return (
    <View className="border-b border-border">
      {sections.map((section, index) => (
        // Sections have no ids, and never reorder.
        <DetailsSection
          key={`${section.title}-${index}`}
          title={section.title}
          blocks={section.blocks}
        />
      ))}
    </View>
  );
};

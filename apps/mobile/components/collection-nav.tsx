import { Link } from "expo-router";
import { useRef } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { useNavLinks } from "../lib/queries";

/**
 * The collection links from the Shopify menu (SHO-60), as a row of chips
 * above a collection's products. The web header and the theme read the same
 * menu, so all three surfaces offer the same collections in the same order.
 *
 * The row scrolls sideways, and the current collection is scrolled into view
 * once it has been measured, since it may start past the edge. It's marked
 * selected for VoiceOver rather than being a link to the screen you're on.
 *
 * Nothing renders while the menu loads or if it fails: the products below
 * matter more than the links, and shouldn't wait on them.
 */
export const CollectionNav = ({ current }: { readonly current: string }) => {
  const { data: links } = useNavLinks();
  const scroller = useRef<ScrollView>(null);

  if (!links || links.length === 0) return null;

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Collections"
      contentContainerClassName="gap-2 pb-4"
    >
      {links.map((link) => {
        const selected = link.kind === "collection" && link.handle === current;
        const chip = (
          <Pressable
            accessibilityRole={selected ? "text" : "link"}
            accessibilityState={{ selected }}
            onLayout={
              selected
                ? (e) => {
                    const { x } = e.nativeEvent.layout;
                    scroller.current?.scrollTo({
                      x: Math.max(0, x - 16),
                      animated: false,
                    });
                  }
                : undefined
            }
            className={`rounded-full border px-4 py-2 ${
              selected ? "border-foreground bg-foreground" : "border-border bg-surface"
            }`}
          >
            <Text
              className={`text-sm ${selected ? "font-medium text-surface" : "text-foreground"}`}
            >
              {link.title}
            </Text>
          </Pressable>
        );

        return (
          <Link key={link.id} href={link.path} asChild disabled={selected}>
            {chip}
          </Link>
        );
      })}
    </ScrollView>
  );
};

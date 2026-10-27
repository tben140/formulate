import { Link } from "expo-router";
import { Fragment, useRef } from "react";
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
 * With `onSelect`, a collection chip switches the collection on the screen
 * you're on instead of pushing another one: the chips look like a control on
 * the page, so they shouldn't slide a new screen in, or stack one per tap for
 * Back to walk through. Product links in the menu still navigate.
 *
 * Nothing renders while the menu loads or if it fails: the products below
 * matter more than the links, and shouldn't wait on them.
 */
export const CollectionNav = ({
  current,
  onSelect,
}: {
  readonly current: string;
  readonly onSelect?: (handle: string) => void;
}) => {
  const { data } = useNavLinks();
  const scroller = useRef<ScrollView>(null);

  // The app has no policy screens; those menu items are web and theme only.
  const links = data?.filter((link) => link.kind !== "policy") ?? [];
  if (links.length === 0) return null;

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Collections"
      contentContainerClassName="gap-2 pb-4"
    >
      {links.map((link) => {
        const isCollection = link.kind === "collection";
        const selected = isCollection && link.handle === current;
        const inPlace = isCollection && onSelect !== undefined;
        const chip = (
          <Pressable
            accessibilityRole={inPlace ? "button" : selected ? "text" : "link"}
            accessibilityState={{ selected }}
            // Only set in place: a Link's child must not override its onPress.
            {...(inPlace && !selected ? { onPress: () => onSelect(link.handle) } : {})}
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

        // A Fragment, not a View: a wrapper would make the onLayout x above
        // relative to itself (0) instead of to the scrolling row.
        if (inPlace) return <Fragment key={link.id}>{chip}</Fragment>;

        return (
          <Link key={link.id} href={link.path} asChild disabled={selected}>
            {chip}
          </Link>
        );
      })}
    </ScrollView>
  );
};

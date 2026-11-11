import { Link } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { useShopGroups } from "../lib/queries";

/**
 * Everything to browse, grouped: the app's version of web's header Shop
 * dropdown, from the same Shopify menus (Shop by goal, by product family, by
 * format). Reached from the Shop chip above a collection and from the home
 * screen. Each group is a list of rows, which suits a thumb better than web's
 * columns.
 */
const ShopScreen = () => {
  const { data: groups, isPending, isError } = useShopGroups();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading the shop" />
      </View>
    );
  }

  if (isError || groups.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base text-foreground-muted">
          Nothing to browse right now. Try the search instead.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="gap-8 p-4 pb-12">
      {groups.map((group) => (
        <View key={group.title}>
          <Text
            accessibilityRole="header"
            className="text-xs font-semibold tracking-wide text-foreground uppercase"
          >
            {group.title}
          </Text>
          <View className="mt-2 border-t border-border">
            {group.links.map((link) => (
              <Link key={link.id} href={link.path} asChild>
                <Pressable
                  accessibilityRole="link"
                  className="flex-row items-center justify-between border-b border-border py-3"
                >
                  <Text className="text-base text-foreground">{link.title}</Text>
                  <Text aria-hidden className="text-base text-foreground-muted">
                    ›
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

export { ShopScreen as default };

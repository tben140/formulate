import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { CartButton } from "./cart-button";

/** The header's right side: Search, then Cart, matching the web header. */
export const HeaderActions = () => (
  <View className="flex-row items-center gap-5">
    <Link href="/search" asChild>
      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Search products"
      >
        <Text className="text-base text-foreground">Search</Text>
      </Pressable>
    </Link>
    <CartButton />
  </View>
);

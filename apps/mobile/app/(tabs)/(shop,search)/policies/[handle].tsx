import { policyBlocks } from "@formulate/shopify";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { usePolicy } from "../../../../lib/queries";

/**
 * A store policy (privacy, subscription and so on), as written in Shopify
 * admin → Settings → Policies, reached from the footer's Legal links. The
 * same `/policies/<handle>` path as web and the theme, so a shared link works
 * on all three.
 *
 * The body is HTML and the app has no HTML renderer, so it's shown as plain
 * headings, paragraphs and list items (policyBlocks). Links in a policy keep
 * their text but aren't tappable.
 */
const PolicyScreen = () => {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { data: policy, isPending, isError, error } = usePolicy(handle ?? "");

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base font-semibold text-danger">
          Could not load this policy
        </Text>
        <Text className="mt-2 text-center text-sm text-foreground-muted">
          {error.message}
        </Text>
      </View>
    );
  }

  if (!policy) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base text-foreground-muted">Policy not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="p-4 pb-12">
      <Stack.Screen options={{ title: policy.title }} />
      <Text accessibilityRole="header" className="text-3xl font-semibold text-foreground">
        {policy.title}
      </Text>
      {policyBlocks(policy.body).map((block, index) =>
        block.kind === "heading" ? (
          <Text
            // The blocks never reorder, so their position is a stable key.
            key={index}
            accessibilityRole="header"
            className="mt-6 text-lg font-semibold text-foreground"
          >
            {block.text}
          </Text>
        ) : (
          <Text key={index} className="mt-3 text-base leading-6 text-foreground-muted">
            {block.kind === "item"
              ? `${block.number === undefined ? "•" : `${block.number}.`}  ${block.text}`
              : block.text}
          </Text>
        ),
      )}
    </ScrollView>
  );
};

export { PolicyScreen as default };

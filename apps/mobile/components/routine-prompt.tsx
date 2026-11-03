import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useRoutineGoals } from "../lib/queries";

/**
 * The routine quiz's entry point below a collection and on an empty search,
 * as on web's <RoutinePrompt /> (SHO-161). Not on product screens, where it
 * would pull someone away from a product they've picked.
 *
 * Hidden until the quiz's goals exist in Shopify, the same rule as the home
 * screen's button.
 */
export const RoutinePrompt = () => {
  const { data: goals } = useRoutineGoals();
  if (!goals || goals.length === 0) return null;
  return (
    <View className="mt-8 gap-3 rounded-xl border border-border p-5">
      <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
        Not sure where to start?
      </Text>
      <Text className="text-foreground-muted">
        Answer four questions and we&apos;ll suggest a routine.
      </Text>
      <Link href="/routine" asChild>
        <Pressable
          accessibilityRole="link"
          className="self-start rounded-md border border-foreground px-5 py-3"
        >
          <Text className="font-semibold text-foreground">Find your routine</Text>
        </Pressable>
      </Link>
    </View>
  );
};

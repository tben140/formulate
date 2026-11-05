import type { BadgeTone, ShownBadge } from "@formulate/shopify";
import { Text, View } from "react-native";

/** Token-backed colours, each at least 4.5:1 for the small text. */
const TONE: Readonly<Record<BadgeTone, string>> = {
  brand: "bg-brand-700",
  sale: "bg-danger",
  new: "bg-success",
  neutral: "bg-ink-800",
};

/**
 * A product's badges (SHO-202), from `productBadges`: a live campaign's first.
 * Matches apps/web's ProductBadges. Rows read them in their own label, so
 * these are hidden from the accessibility tree there (`hidden`).
 */
export const ProductBadges = ({
  badges,
  hidden = false,
}: {
  readonly badges: readonly ShownBadge[];
  readonly hidden?: boolean;
}) =>
  badges.length === 0 ? null : (
    <View
      className="flex-row flex-wrap gap-1"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      {badges.map((badge) => (
        <View
          key={badge.label}
          className={`self-start rounded-full px-2 py-0.5 ${TONE[badge.tone]}`}
        >
          <Text className="text-xs font-semibold text-surface">{badge.label}</Text>
        </View>
      ))}
    </View>
  );

import { starFills } from "@formulate/shopify";
import { colours } from "@formulate/tokens";
import { Text, View } from "react-native";

/**
 * Five stars, partly filled for a fractional average, matching web's
 * components/stars.tsx without a native SVG dependency. Each star is a fixed
 * square holding an outline "☆" with a "★" on top, cropped to that star's
 * fill, both in the `rating` token: an outline, not a pale fill, so empty
 * stars and the filled/empty edge have 3:1 contrast (WCAG 1.4.11).
 *
 * Each glyph is centred in its own square, so "☆" and "★" line up even
 * where the font gives them different widths, and the crop is per star.
 *
 * One accessible element with a text label: screen readers hear "4.5 out of 5
 * stars from 12 reviews", not five symbols.
 */
export const Stars = ({
  value,
  label,
  size = 16,
}: {
  readonly value: number;
  readonly label: string;
  readonly size?: number;
}) => {
  const glyph = {
    width: size,
    minWidth: size,
    flexShrink: 0,
    fontSize: size,
    lineHeight: size * 1.2,
    textAlign: "center",
    color: colours.rating,
  } as const;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="flex-row gap-px self-start"
    >
      {starFills(value).map((fill, index) => (
        <View
          key={index}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ width: size, height: size * 1.2 }}
        >
          <Text style={glyph}>☆</Text>
          <View
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: size * fill, height: size * 1.2 }}
          >
            <Text style={glyph}>★</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

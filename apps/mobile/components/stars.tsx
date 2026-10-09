import { useState } from "react";
import { Text, View } from "react-native";

/**
 * Five stars, partly filled for a fractional average, matching web's
 * components/stars.tsx without a native SVG dependency: a grey row of "★" with
 * an amber row on top, cropped to the rating's width.
 *
 * ⚠️ The amber row sits in a box fixed at the full row's measured width, which
 * the crop can't squeeze. Cropping the text's own container made it wrap ("★★"
 * on a second line), and numberOfLines made it truncate with an ellipsis.
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
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(1, value / 5));
  const style = { fontSize: size, lineHeight: size * 1.2, letterSpacing: 1 };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="self-start"
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text
          numberOfLines={1}
          style={[style, { color: "#e2e8f0" }]}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          ★★★★★
        </Text>
        {width > 0 ? (
          <View
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: width * fill }}
          >
            {/* A fixed-width box that can't shrink, so the text never wraps or truncates. */}
            <View style={{ width, minWidth: width, flexShrink: 0 }}>
              <Text style={[style, { color: "#f59e0b" }]}>★★★★★</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};

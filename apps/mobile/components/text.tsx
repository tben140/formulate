import { Text as NativeText, type TextProps } from "react-native";

import { fontFor, withoutFontClasses } from "../lib/fonts";

/**
 * The app's `Text`: React Native's, in DM Sans or DM Mono (SHO-144).
 *
 * React Native text doesn't inherit a font, so every `Text` needs one. This
 * picks the face from the `className`'s weight and `font-mono` classes (see
 * lib/fonts.ts), so screens keep writing `font-semibold` and `font-mono` as on
 * web. Import it instead of React Native's `Text`.
 */
export const Text = ({
  className,
  style,
  ...props
}: TextProps & { className?: string }) => (
  <NativeText
    {...props}
    className={withoutFontClasses(className)}
    style={[{ fontFamily: fontFor(className) }, style]}
  />
);

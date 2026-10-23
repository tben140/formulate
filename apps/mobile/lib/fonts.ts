/**
 * DM Sans and DM Mono in the app (SHO-144), the typefaces web and the theme
 * take from packages/tokens.
 *
 * Each weight is registered under its own name and chosen explicitly, rather
 * than registering one family and letting `fontWeight` pick the face.
 * ⚠️ That shortcut doesn't work with these files: in Fontsource's TTFs DM Sans
 * is named "DM Sans 9pt" and DM Mono Medium is a family of its own ("DM Mono
 * Medium", checked 2026-10-04), so iOS can't group the weights, and Android
 * never matches a runtime-loaded font by weight. Naming each face makes the
 * choice the same on iOS, Android, Expo Go and web.
 *
 * Loaded at startup with `useFonts` (app/_layout.tsx), so it works in Expo Go
 * as well as in builds. The files are Fontsource's Latin subset, the same
 * release as the web fonts (@fontsource/dm-sans 5.3.0), as TTF because React
 * Native can't use WOFF2. Weights: the 400/500/600 the surfaces use.
 */

export const FONT_FILES = {
  "DMSans-Regular": require("../assets/fonts/dm-sans-latin-400-normal.ttf"),
  "DMSans-Medium": require("../assets/fonts/dm-sans-latin-500-normal.ttf"),
  "DMSans-SemiBold": require("../assets/fonts/dm-sans-latin-600-normal.ttf"),
  "DMMono-Regular": require("../assets/fonts/dm-mono-latin-400-normal.ttf"),
  "DMMono-Medium": require("../assets/fonts/dm-mono-latin-500-normal.ttf"),
} as const;

export type FontName = keyof typeof FONT_FILES;

/** Tailwind's weight classes, as the app's `className`s use them. */
const WEIGHT =
  /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;
const MONO = /\bfont-mono\b/;
const FONT_CLASSES =
  /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|mono)\b/g;

/**
 * The face for a `className`. Bold and heavier map to SemiBold: 600 is the
 * heaviest weight shipped, as on web, where the theme maps bold to 600 rather
 * than letting a browser fake a heavier one. Mono stops at Medium.
 */
export const fontFor = (className = ""): FontName => {
  const weight = WEIGHT.exec(className)?.[1] ?? "normal";
  const heavy = ["semibold", "bold", "extrabold", "black"].includes(weight);
  if (MONO.test(className))
    return weight === "normal" || weight === "light" ? "DMMono-Regular" : "DMMono-Medium";
  if (heavy) return "DMSans-SemiBold";
  if (weight === "medium") return "DMSans-Medium";
  return "DMSans-Regular";
};

/**
 * `className` without its font classes. The face already carries the weight;
 * leaving `font-semibold` in would also set fontWeight, and Android then
 * draws a fake bold on top of the real SemiBold.
 */
export const withoutFontClasses = (className = ""): string =>
  className.replace(FONT_CLASSES, " ").replace(/\s+/g, " ").trim();

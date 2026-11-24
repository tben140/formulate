import { WEBP_ACCEPT, sizedImageUrl } from "@formulate/shopify";
import { Image, type ImageStyle } from "expo-image";
import { PixelRatio, Platform, type StyleProp } from "react-native";

/**
 * A Shopify product or collection image, right-sized (SHO-62).
 *
 * `width` and `height` are the size it's drawn at, in points. It asks the CDN
 * for that many device pixels, as WebP: the header matters, because the CDN
 * picks the format from it and React Native's image loaders don't ask for
 * WebP. Without both, a 64 pt thumbnail was the 1.5 MB original PNG; with
 * them it's about 4 KB. See packages/shopify image-url.ts.
 *
 * The muted background is the placeholder while it loads, and what's left if
 * there's no image at all.
 */
export const ShopImage = ({
  url,
  width,
  height,
  style,
  transition = 150,
  alt = "",
}: {
  readonly url: string | null | undefined;
  /** Drawn width in points. */
  readonly width: number;
  /** Drawn height in points; omit to keep the image's own aspect ratio. */
  readonly height?: number;
  readonly style?: StyleProp<ImageStyle>;
  readonly transition?: number;
  /**
   * What the image shows, for screen readers. Leave it empty (the default)
   * when the image sits inside a control that's already labelled, like a
   * product row: then it's decoration, and VoiceOver and the web build both
   * skip it. Give it only where the image is content on its own.
   */
  readonly alt?: string;
}) => {
  const scale = PixelRatio.get();
  const source = url
    ? {
        uri: sizedImageUrl(url, {
          width: width * scale,
          ...(height !== undefined ? { height: height * scale } : {}),
        }),
        // Native only: a browser already sends a WebP-capable Accept, and on
        // web, custom headers make expo-image fetch the image a second time.
        ...(Platform.OS === "web" ? {} : { headers: { Accept: WEBP_ACCEPT } }),
      }
    : null;

  return (
    <Image
      source={source}
      contentFit="cover"
      transition={transition}
      // Disk as well as memory, so a list scrolled back up or a product
      // reopened doesn't download again.
      cachePolicy="memory-disk"
      // surface-muted from packages/tokens.
      style={[{ backgroundColor: "#f1f5f9" }, style]}
      alt={alt}
      // Also as accessibilityLabel: expo-image's web renderer (57.0.5) only
      // reads `alt` for the placeholder, and labels the loaded image from
      // accessibilityLabel alone. Native reads it the same way.
      accessibilityLabel={alt}
      accessible={alt !== ""}
      accessibilityIgnoresInvertColors
    />
  );
};

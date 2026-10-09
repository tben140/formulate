/**
 * The product page gallery's rules, shared by web and the app so the same
 * product shows the same images in the same order on both. The Liquid theme
 * can't import this; sections/product.liquid follows the same order (the
 * featured image first, then the rest) with a pointer back here.
 */

export interface GalleryImage {
  readonly url: string;
  readonly altText?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
}

/** How many images the product query asks for (images(first: 10)). */
export const GALLERY_LIMIT = 10;

/**
 * The featured image first, then the product's other images, each once.
 *
 * Shopify's featured image is normally also the first of `images`, but a
 * merchant can feature any of them, so it's matched by URL (minus the query
 * string, which Shopify varies) rather than assumed to be first.
 */
export const galleryImages = <T extends GalleryImage>(product: {
  readonly featuredImage?: T | null;
  readonly images?: { readonly nodes: readonly T[] } | null;
}): readonly T[] => {
  const key = (image: GalleryImage): string => image.url.split("?")[0] ?? image.url;
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const image of [product.featuredImage, ...(product.images?.nodes ?? [])]) {
    if (!image || seen.has(key(image))) continue;
    seen.add(key(image));
    ordered.push(image);
  }
  return ordered.slice(0, GALLERY_LIMIT);
};

/** "Image 2 of 5", for the counter and for screen readers. */
export const galleryPosition = (index: number, count: number): string =>
  `Image ${index + 1} of ${count}`;

/** A slide's alt text: the merchant's, or the product title and position. */
export const galleryAlt = (
  image: GalleryImage,
  productTitle: string,
  index: number,
  count: number,
): string =>
  image.altText?.trim() ||
  (count > 1
    ? `${productTitle}, ${galleryPosition(index, count).toLowerCase()}`
    : productTitle);

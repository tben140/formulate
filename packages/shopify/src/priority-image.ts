/**
 * Which card in a product grid loads its image first: the first with an image,
 * or -1 when none has one.
 *
 * That image is the page's Largest Contentful Paint at every column count (the
 * top-left card when the first product has a photo), so it alone is eager and
 * high priority (SHO-143, SHO-148).
 * Counting from the first card with an image keeps a placeholder in first
 * place from leaving every photo lazy. Takes any list, because search results
 * can include nodes that aren't products.
 */
export const priorityIndex = (items: readonly object[]): number =>
  items.findIndex((item) => "featuredImage" in item && Boolean(item.featuredImage));

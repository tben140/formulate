/**
 * The collection the storefront opens on.
 *
 * `automated-collection` is a seeded smart collection on the demo store
 * (products priced between £200 and £800), which gives the slice eight real
 * products to render.
 */
export const DEFAULT_COLLECTION_HANDLE = "automated-collection";

/**
 * Must match the schema version codegen ran against — see codegen.ts. Bumping
 * one without the other is how generated types silently drift from reality.
 */
export const DEFAULT_API_VERSION = "2026-04";

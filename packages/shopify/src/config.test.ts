import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_COLLECTION_HANDLE } from "./config";

/**
 * Files that can't import DEFAULT_COLLECTION_HANDLE (Liquid, plain Node, YAML,
 * CommonJS config) and so hold a copy. A stale copy doesn't fail on its own:
 * an empty collection resolves without an error, which is how production's
 * front page became a 404 (#164). So each copy is checked here instead.
 */
const COPIES = [
  "apps/theme/sections/featured-collection.liquid",
  "packages/shopify/scripts/smoke-test.mjs",
  "apps/web/lighthouserc.cjs",
  "apps/web/playwright.config.ts",
  "apps/web/e2e/global-setup.ts",
  ".github/workflows/lighthouse-theme.yml",
];

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("DEFAULT_COLLECTION_HANDLE", () => {
  it.each(COPIES)("is the handle %s uses", (path) => {
    const text = readFileSync(root + path, "utf8");
    const handles = [
      // Up to the next delimiter, so a longer handle (best-sellers_2026) is
      // read whole and fails, rather than matching its first part.
      ...text.matchAll(/collections(?:\/|\['|: )([^\s'"`,/?#)\]]+)/g),
      ...text.matchAll(/collection_handle: (\S+)/g),
      ...text.matchAll(/handle: "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(handles.length, `no collection handle found in ${path}`).toBeGreaterThan(0);
    expect(new Set(handles)).toEqual(new Set([DEFAULT_COLLECTION_HANDLE]));
  });
});

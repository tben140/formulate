import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Packages replaced wholesale in stories. */
const PACKAGES: Record<string, string> = {
  "expo-router": here("../__mocks__/expo-router.tsx"),
  "expo-image": here("../__mocks__/expo-image.tsx"),
};

/** The app's own modules that reach Expo's native layer or the network. */
const MODULES: Record<string, string> = {
  [here("../lib/klaviyo.ts")]: here("../lib/__mocks__/klaviyo.ts"),
  [here("../lib/use-cart.ts")]: here("../lib/__mocks__/use-cart.ts"),
};

/**
 * Swaps modules for their story mocks when they're resolved.
 *
 * Storybook's own `sb.mock` still loads each real module to learn its exports,
 * and Expo's packages (TypeScript source reaching into the native module
 * layer) don't load in a browser at all. Redirecting at resolve time means the
 * real module is never read. Stories import the same paths as the components,
 * so `mocked(subscribe)` in a story configures the spy the component calls.
 */
export const storyMocks = (): Plugin => ({
  name: "story-mocks",
  enforce: "pre",
  async resolveId(source, importer, options) {
    const pkg = PACKAGES[source];
    if (pkg) return pkg;
    if (!importer || !source.startsWith(".")) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    const mock = resolved ? MODULES[resolved.id.split("?")[0] ?? ""] : undefined;
    return mock ?? null;
  },
});

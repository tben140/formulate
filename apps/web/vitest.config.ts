import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Runs every story as a test in headless Chromium: it must render, its `play`
 * function (if any) must pass, and the a11y addon must find no WCAG 2.2 AA
 * violation (`a11y.test: "error"` in .storybook/preview.ts).
 *
 * Separate from the Playwright e2e suite, which drives whole pages against the
 * real store. These need no network and no Shopify token.
 */
export default defineConfig({
  plugins: [storybookTest({ configDir: ".storybook" })],
  // tsconfig's `@/*` path, which Storybook's own builder sets up but Vitest
  // doesn't.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
    setupFiles: [".storybook/vitest.setup.ts"],
  },
});

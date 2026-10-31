import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Runs every story as a test in headless Chromium: it must render, its `play`
 * function (if any) must pass, and the a11y addon must find no WCAG 2.2 AA
 * violation (`a11y.test: "error"` in .storybook/preview.ts).
 *
 * Rendered through React Native Web, like the Storybook itself: this checks
 * the components' logic, markup and web accessibility. Native-only behaviour
 * is still checked on a device.
 */
export default defineConfig({
  plugins: [storybookTest({ configDir: ".storybook" })],
  // Vitest's dependency scanner follows the real imports, not the mocks, and
  // Expo's packages ship TypeScript it can't pre-bundle. The stories never
  // load these (.storybook/story-mocks.ts swaps them out), so skip them.
  //
  // react-native-web is listed up front because a cold run (every CI run)
  // otherwise discovers it late, re-bundles and reloads mid-run, failing every
  // story after the first file.
  optimizeDeps: {
    include: ["react-native-web"],
    exclude: [
      "expo-router",
      "expo-image",
      "expo-constants",
      "expo-secure-store",
      "expo-modules-core",
    ],
  },
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});

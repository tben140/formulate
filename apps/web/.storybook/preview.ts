import type { Preview } from "@storybook/nextjs-vite";
import { sb } from "storybook/test";

// Server Actions and Klaviyo calls are replaced with spies in every story, so
// nothing reaches Shopify or Klaviyo. Stories set return values with mocked().
sb.mock(import("../app/actions/cart.ts"), { spy: false });
sb.mock(import("../lib/klaviyo.ts"), { spy: false });

// The same stylesheet the app loads: Tailwind, the shared tokens and DM Sans.
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    // WCAG 2.2 AA, the project's target. "error" fails the story's test run on
    // any violation, like the Playwright axe scans do for whole pages.
    a11y: {
      test: "error",
      options: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      },
    },
    nextjs: { appDirectory: true },
  },
};

export default preview;

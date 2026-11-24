import type { Preview } from "@storybook/react-native-web-vite";

// Navigation, Klaviyo and the cart hooks are swapped for mocks at resolve
// time (story-mocks.ts), so no story touches Expo's native layer or the network.

// The app's own stylesheet: Tailwind through NativeWind, plus the shared tokens.
import "../global.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    a11y: {
      test: "error",
      options: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      },
    },
  },
};

export default preview;

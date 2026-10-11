import type { Preview } from "@storybook/react-native-web-vite";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Navigation, Klaviyo and the cart hooks are swapped for mocks at resolve
// time (story-mocks.ts), so no story touches Expo's native layer or the network.

// The app's own stylesheet: Tailwind through NativeWind, plus the shared tokens.
import "../global.css";

/** An iPhone-sized frame with no notch, so insets are 0 and layouts are stable. */
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const preview: Preview = {
  // Expo Router supplies this in the app. Sheets and the sticky bar read it.
  decorators: [
    (Story) => (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <Story />
      </SafeAreaProvider>
    ),
  ],
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

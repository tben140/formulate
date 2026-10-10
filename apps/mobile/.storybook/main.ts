import type { StorybookConfig } from "@storybook/react-native-web-vite";

import { nativewindWeb } from "./nativewind-web";
import { storyMocks } from "./story-mocks";

/**
 * Storybook for the app's components, rendered in the browser through React
 * Native Web. It's composed into the web Storybook under "App", so each shared
 * component's two implementations sit side by side.
 *
 * This is the browser view of the components, not the phone. Behaviour that
 * only exists natively (haptics, the checkout sheet, VoiceOver announcements)
 * is still checked on a device.
 */
const config: StorybookConfig = {
  framework: { name: "@storybook/react-native-web-vite", options: {} },
  stories: ["../components/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  staticDirs: [{ from: "../../../packages/tokens/fonts", to: "/assets/fonts" }],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [storyMocks(), nativewindWeb(), ...(viteConfig.plugins ?? [])];
      viteConfig.build = { ...viteConfig.build, minify: false };
    return viteConfig;
  },
};

export default config;

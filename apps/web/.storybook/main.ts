import type { StorybookConfig } from "@storybook/nextjs-vite";

/**
 * Storybook for the web storefront's components.
 *
 * Stories cover client and presentational components. Pages and anything that
 * fetches from Shopify on the server are covered by the Playwright suite
 * instead, against the real store.
 *
 * The app's Storybook (apps/mobile/.storybook) is composed in under "App",
 * so the two versions of each shared component sit side by side.
 */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../components/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  // globals.css inlines the tokens' fonts.css, whose `./fonts/` URLs then
  // resolve next to the built stylesheet in assets/. Serve the font files there.
  staticDirs: [{ from: "../../../packages/tokens/fonts", to: "/assets/fonts" }],
  core: { disableTelemetry: true },
  refs: (_config, { configType }) => ({
    app: {
      title: "App (React Native)",
      url: configType === "DEVELOPMENT" ? "http://localhost:6007" : "./app",
    },
  }),
};

export default config;

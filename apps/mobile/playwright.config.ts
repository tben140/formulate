import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests for the app, run against Expo's web build (SHO-151).
 *
 * What this covers: navigation (the tab bar, each tab's own history), search,
 * filters and the cart sheet, through react-native-web. What it doesn't: native
 * rendering, gestures and the iOS-only code paths (Checkout Sheet Kit, the
 * Klaviyo SDK). Those need a device or simulator, which is the Maestro job in
 * SHO-26. A navigation bug fails here long before anyone opens a simulator.
 *
 * Starts its own Expo web server unless E2E_BASE_URL points at a running one
 * (the droplet's preview serves web on :8081).
 */
const PORT = 8092;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One Metro bundle shared by every test: in parallel they'd all wait on it.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // The first request bundles the app, which takes a while on a cold Metro.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    // A phone-sized screen: this is the app's layout, not a desktop one.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx expo start --web --port ${PORT}`,
        url: baseURL,
        // CI=1: no prompts, no file watching.
        env: { CI: "1", EXPO_NO_TELEMETRY: "1" },
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});

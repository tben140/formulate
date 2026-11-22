import { defineConfig, devices } from "@playwright/test";

/**
 * Renders every template the ways inboxes do (docs/email-testing.md): light,
 * dark where the email's own dark styles apply, and forced dark, Chromium's
 * automatic inversion, the closest thing on a runner to what the Gmail and
 * Outlook apps do to an email. Screenshots land in screenshots/ with an
 * index.html to look through; CI uploads them.
 */
export default defineConfig({
  testDir: "render",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { ...devices["Desktop Chrome"] },
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
    {
      name: "forced-dark",
      use: {
        colorScheme: "dark",
        launchOptions: {
          args: ["--enable-features=WebContentsForceDark:inversion_method/cielab_based"],
        },
      },
    },
  ],
});

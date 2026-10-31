import { defineConfig } from "vitest/config";

// Unit tests for server-side helpers (lib/**/*.test.ts). Pages and flows are
// covered by the Playwright suite in e2e/.
export default defineConfig({
  test: { include: ["lib/**/*.test.ts"], environment: "node" },
});

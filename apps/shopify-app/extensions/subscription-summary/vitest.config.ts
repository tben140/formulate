import { defineConfig } from "vitest/config";

// The shared plan reader is tested from here; both extensions use it.
export default defineConfig({
  test: { include: ["../../shared/**/*.test.ts", "src/**/*.test.ts"] },
});

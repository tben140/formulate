import { defineConfig } from "vitest/config";

// render/ is Playwright's (pnpm test:render), not Vitest's.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });

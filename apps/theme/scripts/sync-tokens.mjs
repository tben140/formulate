/**
 * Copies the generated design tokens into the theme's assets.
 *
 * The theme deliberately has no bundler — Shopify CLI serves `assets/` as-is,
 * and Horizon ships 81 JS files with no package.json or tsconfig. So the
 * committed `assets/tokens.css` is what actually runs, and this script only
 * exists to regenerate it.
 *
 * That means the theme stays fully usable with plain `shopify theme dev` or
 * `shopify theme push` by anyone who never runs this repo's tooling.
 *
 * Source of truth: packages/tokens/src/tokens.ts
 * Run: pnpm --filter @formulate/theme build
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Resolved through the package's exports map rather than a relative path, so
// this keeps working if the workspace layout changes.
const source = require.resolve("@formulate/tokens/tokens.css");
const destination = join(here, "..", "assets", "tokens.css");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);

console.log(`Wrote ${destination}`);

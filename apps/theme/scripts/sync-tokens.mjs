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

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets");

mkdirSync(assets, { recursive: true });

// Resolved through the package's exports map rather than a relative path, so
// this keeps working if the workspace layout changes.
const tokens = require.resolve("@formulate/tokens/tokens.css");
copyFileSync(tokens, join(assets, "tokens.css"));
console.log(`Wrote ${join(assets, "tokens.css")}`);

// Fonts (SHO-110). `assets/` is flat, so the files are copied alongside the
// stylesheet and the `./fonts/` prefix is dropped from every url(). A relative
// url() then resolves on Shopify's CDN exactly as it does locally.
const fontsCss = require.resolve("@formulate/tokens/fonts.css");
const css = readFileSync(fontsCss, "utf8");
const files = [...css.matchAll(/url\("\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);

for (const file of files) {
  copyFileSync(join(dirname(fontsCss), "fonts", file), join(assets, basename(file)));
  console.log(`Wrote ${join(assets, basename(file))}`);
}

writeFileSync(join(assets, "fonts.css"), css.replaceAll('url("./fonts/', 'url("'), "utf8");
console.log(`Wrote ${join(assets, "fonts.css")}`);

/**
 * Fails when any stylesheet in assets/ doesn't parse.
 *
 * Why this exists: a merge conflict resolution (839cfeb) dropped a `}` and the
 * next comment's `/*` in critical.css. Browsers don't fail on that, they
 * recover by discarding rules, so the DM Mono price font silently stopped
 * applying for days. `shopify theme check` reads Liquid, not CSS, so nothing
 * caught it.
 *
 * Parsing only, through Prettier's CSS parser (already a repo dependency): the
 * point is broken syntax, not formatting, so this never fails on style.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const sheets = (await readdir(assets)).filter((name) => name.endsWith(".css"));

let failed = false;
for (const name of sheets) {
  try {
    await format(await readFile(assets + name, "utf8"), { parser: "css" });
  } catch (error) {
    failed = true;
    console.error(`assets/${name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed) process.exit(1);
console.log(`CSS parses: ${sheets.length} stylesheets in assets/.`);

/**
 * `pnpm --filter @formulate/emails check [file.html ...]`: checks each email
 * (every template when none are named) and prints what to fix. Exits 1 on any
 * error, so it can gate a Klaviyo upload.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { checkEmail } from "../src/check.ts";

const templates = new URL("../templates/", import.meta.url).pathname;
const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(templates)
        .filter((name) => name.endsWith(".html"))
        .map((name) => join(templates, name));

let failed = false;
for (const file of files) {
  const { errors, warnings } = checkEmail(readFileSync(file, "utf8"));
  console.log(`\n${file}: ${errors.length} to fix, ${warnings.length} to know`);
  for (const error of errors) console.log(`  ✗ ${error}`);
  for (const warning of warnings) console.log(`  · ${warning}`);
  failed ||= errors.length > 0;
}
process.exit(failed ? 1 : 0);

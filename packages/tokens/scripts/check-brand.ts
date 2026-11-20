/**
 * Fails when the Liquid theme's Wordmark default isn't BRAND_NAME.
 *
 * Web and the app import BRAND_NAME from src/tokens.ts. The theme can't, so its
 * setting (apps/theme/config/settings_schema.json, Theme settings → Brand)
 * carries its own copy. This runs with the package build, which CI runs on
 * every pull request, so a rename can't update one and miss the other.
 *
 * Run with Node's built-in type stripping: `node scripts/check-brand.ts`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BRAND_NAME } from "../src/tokens.ts";

interface Setting {
  readonly id?: string;
  readonly default?: unknown;
}

interface SettingsGroup {
  readonly settings?: readonly Setting[];
}

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/theme/config/settings_schema.json",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as readonly SettingsGroup[];

const wordmark = schema
  .flatMap((group) => group.settings ?? [])
  .find((setting) => setting.id === "wordmark");

if (wordmark?.default !== BRAND_NAME) {
  console.error(
    `The theme's Wordmark default is ${JSON.stringify(wordmark?.default)}, ` +
      `but BRAND_NAME is ${JSON.stringify(BRAND_NAME)}. ` +
      "Update apps/theme/config/settings_schema.json.",
  );
  process.exit(1);
}

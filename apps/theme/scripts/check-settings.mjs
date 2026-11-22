/**
 * Fails when Liquid reads a theme setting that config/settings_schema.json
 * doesn't define.
 *
 * Why this exists: the main→batch merge 94c56f2e dropped the schema's Social
 * media group while snippets/social-icons.liquid kept reading
 * `settings.social_*_link`. Liquid treats an unknown setting as blank, so the
 * footer icons silently disappeared and `shopify theme check` said nothing.
 *
 * Only theme-wide settings (`settings.x`): `section.settings.x` and
 * `block.settings.x` are each section's or block's own schema.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const schema = JSON.parse(await readFile(root + "config/settings_schema.json", "utf8"));
const defined = new Set(
  schema.flatMap((group) => (group.settings ?? []).map((setting) => setting.id)),
);

// `settings.x` or `settings['x']`, not preceded by `.`, `]` or a word
// character, which would make it a section's or block's settings.
const read = /(?<![\w.\]])settings(?:\.([a-z0-9_]+)|\[\s*['"]([a-z0-9_]+)['"]\s*\])/g;

let failed = false;
for (const dir of ["layout", "sections", "snippets", "blocks", "templates"]) {
  const names = await readdir(root + dir).catch(() => []);
  for (const name of names.filter((n) => n.endsWith(".liquid"))) {
    const lines = (await readFile(`${root}${dir}/${name}`, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(read)) {
        const id = match[1] ?? match[2];
        if (!defined.has(id)) {
          failed = true;
          console.error(
            `${dir}/${name}:${index + 1}: settings.${id} isn't in config/settings_schema.json`,
          );
        }
      }
    });
  }
}

if (failed) process.exit(1);

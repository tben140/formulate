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

/**
 * Shopify accepts comments and trailing commas in settings_schema.json, which
 * JSON.parse doesn't: blank them out, leaving strings alone.
 * @param {string} text
 */
const parseJsonc = (text) => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const string = end.exec(text)?.[0] ?? text.slice(i);
      out += string;
      i += string.length - 1;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (char === "," && /^\s*[}\]]/.test(text.slice(i + 1))) {
      // A trailing comma.
    } else {
      out += char;
    }
  }
  return JSON.parse(out);
};

const schema = parseJsonc(await readFile(root + "config/settings_schema.json", "utf8"));
const defined = new Set(
  schema.flatMap((group) => (group.settings ?? []).map((setting) => setting.id)),
);

// `settings.x` or `settings['x']`, not preceded by `.`, `]` or a word
// character, which would make it a section's or block's settings.
const read = /(?<![\w.\]])settings(?:\.([a-z0-9_]+)|\[\s*['"]([a-z0-9_]+)['"]\s*\])/g;

/**
 * Liquid never runs what's inside a comment or doc block, or an inline
 * `{% # ... %}` comment, so a setting named there isn't a read. Blanked out
 * rather than removed, so line numbers stay right.
 * @param {string} source
 */
const withoutComments = (source) =>
  source.replace(
    /\{%-?\s*(comment|doc)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}|\{%-?\s*#[\s\S]*?-?%\}/g,
    (comment) => comment.replace(/[^\n]/g, " "),
  );

let failed = false;
for (const dir of ["layout", "sections", "snippets", "blocks", "templates"]) {
  // Recursive, for templates/customers/.
  const names = await readdir(root + dir, { recursive: true }).catch(() => []);
  for (const name of names.filter((n) => n.endsWith(".liquid"))) {
    const source = await readFile(`${root}${dir}/${name}`, "utf8");
    const lines = withoutComments(source).split("\n");
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

/**
 * Generates the CSS forms of the design tokens from `src/tokens.ts`.
 *
 * Two outputs, because the three surfaces consume tokens differently:
 *
 *   theme.css   `@theme { … }`  — Tailwind v4 (apps/web and apps/mobile).
 *                                 Tailwind is CSS-first, so the theme is
 *                                 declared as custom properties rather than in
 *                                 a JS config object.
 *
 *   tokens.css  `:root { … }`   — plain custom properties for the Liquid theme
 *                                 (apps/theme), which has no Tailwind and no
 *                                 build step. Copied into the theme's assets
 *                                 by its own sync script and committed there.
 *
 * The token values are identical in both; only the wrapper differs. That is
 * the whole point — one source of truth behind three runtimes.
 *
 * Run with Node's built-in type stripping: `node scripts/build-css.ts`
 * (Node >= 22.18 strips TypeScript types without a flag).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { colours, fontFaces, fontFamily, fontSize, radius, spacing } from "../src/tokens.ts";

const isColourScale = (value: unknown): value is Record<string, string> =>
  typeof value === "object" && value !== null;

/** `brand` + `{500: "#fff"}` -> `--color-brand-500: #fff;` */
const colourLines = (): string[] =>
  Object.entries(colours).flatMap(([name, value]) => {
    if (typeof value === "string") return [`  --color-${name}: ${value};`];
    if (!isColourScale(value)) return [];
    return Object.entries(value).map(
      ([step, hex]) => `  --color-${name}-${step}: ${hex};`,
    );
  });

const namespaceLines = (prefix: string, values: Record<string, string>): string[] =>
  Object.entries(values).map(([key, value]) => `  --${prefix}-${key}: ${value};`);

/** The token declarations, shared verbatim by both outputs. */
const declarations: string[] = [
  "  /* Colours */",
  ...colourLines(),
  "",
  "  /* Spacing */",
  ...namespaceLines("spacing", spacing),
  "",
  "  /* Radii */",
  ...namespaceLines("radius", radius),
  "",
  "  /* Type scale */",
  ...namespaceLines("text", fontSize),
  "",
  // `--font-*` is Tailwind's font-family namespace, so these become the
  // `font-sans` and `font-mono` utilities, and `--font-sans` is also the page
  // default through Tailwind's preflight.
  "  /* Typefaces */",
  ...Object.entries(fontFamily).map(([key, { stack }]) => `  --font-${key}: ${stack};`),
];

/**
 * `@font-face` for every file in `fontFaces`. The URLs are relative to this
 * package, and each consumer resolves them its own way: Next's CSS pipeline
 * bundles them, and the theme's sync script copies the files flat into
 * `assets/` and drops the `fonts/` prefix.
 *
 * `font-display: swap` shows text in the fallback immediately rather than
 * hiding it while the font loads.
 */
const fontFaceRules = fontFaces
  .map(
    ({ family, weight, file }) => `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url("./fonts/${file}") format("woff2");
}`,
  )
  .join("\n\n");

const banner = (consumer: string) => `/*
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/tokens/src/tokens.ts
 * Consumer: ${consumer}
 * Regenerate: pnpm --filter @formulate/tokens build
 */`;

const here = dirname(fileURLToPath(import.meta.url));

const outputs: { file: string; contents: string }[] = [
  {
    file: "theme.css",
    contents: `${banner("apps/web and apps/mobile, via Tailwind v4")}

@theme {
${declarations.join("\n")}
}
`,
  },
  {
    file: "fonts.css",
    contents: `${banner("apps/web (bundled by Next) and apps/theme (as assets/fonts.css)")}

${fontFaceRules}
`,
  },
  {
    file: "tokens.css",
    contents: `${banner("apps/theme (Liquid), via assets/tokens.css")}

:root {
${declarations.join("\n")}
}
`,
  },
];

for (const { file, contents } of outputs) {
  const path = join(here, "..", file);
  writeFileSync(path, contents, "utf8");
  console.log(`Wrote ${path}`);
}

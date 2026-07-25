/**
 * Generates `theme.css` from `src/tokens.ts`.
 *
 * Both apps are on Tailwind v4, which is CSS-first: the theme is declared as
 * custom properties inside an `@theme` block rather than in a JS config
 * object. That means one generated file serves web (via globals.css) and
 * native (via NativeWind's global.css) with no duplication.
 *
 * Run with Node's built-in type stripping: `node scripts/build-css.ts`
 * (Node >= 22.18 strips TypeScript types without a flag).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { colours, fontSize, radius, spacing } from "../src/tokens.ts";

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

const sections: string[] = [
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
];

const output = `/*
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/tokens/src/tokens.ts
 * Regenerate: pnpm --filter @formulate/tokens build
 */

@theme {
${sections.join("\n")}
}
`;

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "..", "theme.css");
writeFileSync(outputPath, output, "utf8");

console.log(`Wrote ${outputPath}`);

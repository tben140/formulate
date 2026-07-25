import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat config for every package in the workspace.
 *
 * Deliberately not type-aware: enabling `projectService` would make linting
 * depend on a full type-check of each package, roughly tripling lint time for
 * rules we largely get from `tsc --noEmit` anyway. The rules below are all
 * syntactic.
 */
export const base = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      // Codegen output — generated, not hand-written, so not ours to lint.
      "**/generated/**",
      // Generated from tokens.ts; see packages/tokens.
      "**/theme.css",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md: type safety, avoid `any`.
      "@typescript-eslint/no-explicit-any": "error",

      // Keeps type-only imports erasable, which `verbatimModuleSyntax`
      // requires and Metro's Babel transform is happier with.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // CLAUDE.md: explicit error types over generic catches.
      "no-throw-literal": "error",
    },
  },
  {
    // Build scripts and config files run in Node, not a bundler, so they need
    // process/console/fetch declared. Scoped narrowly so app code doesn't
    // silently gain Node globals it won't have at runtime.
    files: [
      "**/*.mjs",
      "**/*.cjs",
      "**/scripts/**/*.{js,ts,mjs}",
      "**/*.config.{js,mjs,cjs,ts}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Must stay last: turns off every rule Prettier owns.
  prettier,
);

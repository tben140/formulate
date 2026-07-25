/**
 * The single source of truth for design tokens across web and native.
 *
 * Nothing here imports from a platform. These are plain values, consumed two
 * ways:
 *
 *   1. As TypeScript, imported directly (React Native StyleSheet escape
 *      hatches, chart colours, anything Tailwind can't express).
 *   2. As CSS custom properties in a Tailwind v4 `@theme` block, generated
 *      into `theme.css` by `scripts/build-css.ts`.
 *
 * Because (2) is generated from (1), a colour cannot drift between the two.
 * Never hand-edit theme.css.
 */

export interface ColourScale {
  readonly 50: string;
  readonly 100: string;
  readonly 200: string;
  readonly 300: string;
  readonly 400: string;
  readonly 500: string;
  readonly 600: string;
  readonly 700: string;
  readonly 800: string;
  readonly 900: string;
}

/** Cool slate blue — reads as technical and product-neutral. */
const brand: ColourScale = {
  50: "#eff5ff",
  100: "#dbe8fe",
  200: "#bfd7fe",
  300: "#93bcfd",
  400: "#609afa",
  500: "#3b7bf6",
  600: "#255deb",
  700: "#1d49d8",
  800: "#1e3daf",
  900: "#1e388a",
};

const ink: ColourScale = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
};

export const colours = {
  brand,
  ink,
  /** Semantic aliases. Prefer these in components over raw scale steps. */
  surface: "#ffffff",
  "surface-muted": ink[100],
  foreground: ink[900],
  "foreground-muted": ink[500],
  border: ink[200],
  danger: "#dc2626",
  success: "#16a34a",
} as const;

/** Base-4 scale. Keys become Tailwind's `--spacing-*` namespace. */
export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radius = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
} as const;

/** Font sizes. Keys become Tailwind's `--text-*` namespace. */
export const fontSize = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "30px",
} as const;

export const tokens = { colours, spacing, radius, fontSize } as const;

export type Tokens = typeof tokens;

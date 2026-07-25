import expoConfig from "eslint-config-expo/flat.js";
import prettier from "eslint-config-prettier";

/**
 * Expo ships its own flat config bundling the React Native, import and
 * react-hooks plugins, so we extend that rather than our `base` — layering
 * both would register the typescript-eslint plugin twice and ESLint errors
 * on duplicate plugin names.
 */
export const reactNative = [
  ...expoConfig,
  {
    ignores: ["**/node_modules/**", "**/.expo/**", "**/dist/**", "**/generated/**"],
  },
  {
    /**
     * eslint-plugin-react 7.37.x (pulled in by eslint-config-expo) crashes on
     * ESLint 10 inside its React *version detection* — resolveBasedir calls
     * context.getFilename(), removed in ESLint 10. Declaring the version
     * explicitly skips detection entirely and sidesteps the bug. Remove once
     * eslint-plugin-react ships ESLint 10 support.
     */
    settings: {
      react: { version: "19.2.8" },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
];

import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

import { base } from "./base.js";

export const next = [
  ...base,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      /*
       * Accessibility at lint time (SHO-21): the cheapest layer, catching what
       * can be seen in the JSX (an image without alt, a click handler on a div,
       * a label with no control). It cannot see contrast, focus order or what
       * a page announces; those are the axe scans and keyboard specs in
       * apps/web/e2e.
       *
       * ⚠️ The plugin declares ESLint up to 9 as a peer and this repo runs 10.
       * It works; eslint-plugin-import and eslint-plugin-react (via
       * eslint-config-expo) are in the same position. Revisit if a release
       * adds 10 to its range.
       */
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
];
